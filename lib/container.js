"use strict";

const {PassThrough} = require('stream');
const drain      = require('nyks/stream/drain');


const STREAM_STDOUT = 1;
const STREAM_STDERR = 2;

class Container  {

  constructor(stack, specs) {
    this.stack = stack;
    this.specs = specs;
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
  }


  async attach(container_id) {

    let qs = {"stream" : true, stdout : true, stderr : true, logs  : true};
    let {socket} = await this.stack.request('POST', {path : `/containers/${container_id}/attach`, qs, headers : {'Upgrade' : 'tcp'}});

    socket.on("end", () => {
      this.stdout.end();
      this.stderr.end();
    });


    let hole;
    let buffer = Buffer.from([]);
    let size = 0;

    let consume = function(size) {
      let out = buffer.slice(0, size);
      buffer = Buffer.from(buffer.slice(size));
      return out;
    }
    let step = (data) => {
      if(data)
        buffer = Buffer.concat([buffer, data]);

      if(!size) {
        let header = consume(8);
        let type = header.readUInt8(0);
        size = header.readUInt32BE(4);

        if(type == STREAM_STDOUT)
          hole = this.stdout;
        if(type == STREAM_STDERR)
          hole = this.stderr;
      }

      if(buffer.length >= size) {
        hole.write(consume(size));
        size = 0;
        if(buffer.length)
          step();
      }
    };

    socket.on('data', step);
  }

  async run() {

    let {EndpointsConfig : networks} = this.specs.NetworkingConfig;
    if(Object.entries(networks).length > 1) {
      //switching to dynamic mode
      delete this.specs.NetworkingConfig;
    } else {
      networks = {};
    }

    let create = await this.stack.request('POST', '/containers/create', this.specs);

    const container = JSON.parse(await drain(create));

    if(create.statusCode !== 201)
      throw `Unable to create container:  msg: ${JSON.stringify(container)},status ${create.statusCode},  ${JSON.stringify(this.specs)}`;

    this.attach(container.Id);

    for(let [network_name, EndpointConfig] of Object.entries(networks)) {
      let payload = {Container : container.Id, EndpointConfig};
      let connected = await this.stack.request('POST', `/networks/${network_name}/connect`, payload);
      if(connected.statusCode !== 200) {
        console.error(String(await drain(connected)));
        throw `Count not attach the container to network ${network_name} (${connected.statusCode})`;
      }
    }

    const wait = await this.stack.request('POST', {path : `/containers/${container.Id}/wait`, qs : {"condition" : 'removed'}});
    const start = await this.stack.request('POST', `/containers/${container.Id}/start`);

    if(start.statusCode !== 204) {
      console.error(String(await drain(start)));
      throw `Unable to start the container: status ${start.statusCode}`;
    }

    const end = JSON.parse(await drain(wait));
    if(wait.statusCode !== 200)
      throw `Unable to wait for the container: status ${wait.statusCode}, msg: ${JSON.stringify(end)}`;

    return end.StatusCode;
  }

}

module.exports = Container;
