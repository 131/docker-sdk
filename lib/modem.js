"use strict";
const request   = require('nyks/http/request');
const keepAliveMgr = require('nyks/async/keepAliveMgr');
const path = require('path');
const fs   = require('fs');

const url       = require('url');

const Client = require('ssh2').Client;
const http = require('http');

class Modem {

  constructor(dockerSock) {

    if(typeof dockerSock == "string")
      dockerSock = url.parse(dockerSock);

    let agent;
    if(dockerSock.protocol == "ssh:") {
      let {auth : username, hostname : host, port} = dockerSock;

      let target = {username, host, port};
      let keypath = path.join(process.env.HOME, '.ssh', 'id_rsa');

      if(process.env.SSH_AUTH_SOCK)
        target.agent = process.env.SSH_AUTH_SOCK;
      else if(fs.existSync(keypath))
        target.privateKey = fs.readFileSync(keypath);

      agent = this.sshlnk(target);
      dockerSock = url.parse("tcp://127.0.0.1:2375");
    }

    this.default_transport_options = {
      ...dockerSock,
      protocol : 'http:',
      agent,
      reqTimeout : 5 * 1000,
      headers : {
        'Content-Type' : 'application/json',
      }
    };

    this.request = this.request.bind(this);
    this.request.agent = agent;
  }

  sshlnk(target) {
    const agent = new http.Agent();

    let lnk;

    let locker = keepAliveMgr(function() {
      lnk = (lnk && lnk.end(), false);
    }, 1000);


    //on agent destroy, clear keepalive
    agent.destroy = locker.bind(null, true);

    agent.createConnection = function(options, fn) { (async () => {

      if(!lnk) {

        lnk = await new Promise((resolve, reject) => {
          const conn = new Client();
          conn.once('ready', () => resolve(conn));
          conn.once('end', () => agent.destroy());
          conn.once('error', reject);
          conn.connect(target);
        });
      }

      let unlocker = locker();

      lnk.exec('docker system dial-stdio', function(err, stream) {
        if(err)
          return unlocker(), fn(err);

        fn(null, stream);
        stream.on('end', unlocker);
      });

    })(); };

    return agent;
  }

  async request(method, query, body = undefined) {
    query = typeof query == "string" ? {path : query} : query;
    const payload = {
      ...this.default_transport_options,
      ...query,
      headers : {...this.default_transport_options.headers, ...query.headers},
      method,
    };

    if(body)
      body = JSON.stringify(body);

    const res = await request(payload, body);
    return res;
  }

}



module.exports = Modem;
