"use strict";
const request   = require('nyks/http/request');
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
      agent = this.sshlnk({username, host, port});
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
  }

  sshlnk(target) {

    const conn = new Client();
    const agent = new http.Agent();

    agent.createConnection = function(options, fn) {
      conn.once('ready', function() {
        conn.exec('docker system dial-stdio', function(err, stream) {
          if(err) {
            conn.end();
            agent.destroy();
            return;
          }

          fn(null, stream);

          stream.once('close', () => {
            conn.end();
            agent.destroy();
          });
        });
      }).connect({...target, agent : process.env.SSH_AUTH_SOCK});

      conn.once('end', () => agent.destroy());
    };

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
