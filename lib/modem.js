"use strict";
const request   = require('nyks/http/request');
const url       = require('url');


class Modem {

  constructor(dockerSock) {

    if(typeof dockerSock == "string")
      dockerSock = url.parse(dockerSock);

    // console.log({dockerSock});

    this.default_transport_options = {
      ...dockerSock,
      protocol : 'http:',
      reqTimeout : 5 * 1000,
      headers : {
        'Content-Type' : 'application/json',
      }
    };
    this.request = this.request.bind(this);
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
