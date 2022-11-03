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

    socket.on('data', (buf) => {
      let offset = 0;
      do {
        let type = buf[offset]; offset += 4;
        let size = buf.readUint32BE(offset); offset += 4;
        let payload = buf.slice(offset, offset + size); offset += size;
        if(type == STREAM_STDOUT)
          this.stdout.write(payload);
        if(type == STREAM_STDERR)
          this.stderr.write(payload);
      } while(offset < buf.length);
    });
  }

  async run() {

    let req = null; // rolling variable

    req = await this.stack.request('POST', '/containers/create', this.specs);

    const container = JSON.parse(await drain(req));
    if(req.statusCode !== 201)
      throw `Unable to create container: status ${req.statusCode}, msg: ${JSON.stringify(container)}, ${JSON.stringify(this.specs)}`;

    this.attach(container.Id);

    const process =  async () => {
      const req = await this.stack.request('POST', `/containers/${container.Id}/wait`, {"condition" : 'removed'});
      const end = JSON.parse(await drain(req));
      if(req.statusCode !== 200)
        throw `Unable to wait for the container: status ${req.statusCode}, msg: ${JSON.stringify(end)}`;

      return end.StatusCode;
    };

    req = await this.stack.request('POST', `/containers/${container.Id}/start`);
    if(req.statusCode !== 204)
      throw `Unable to start the container: status ${req.statusCode}`;


    return process();
  }

}

module.exports = Container;
