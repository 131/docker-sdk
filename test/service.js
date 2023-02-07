"use strict";

const expect = require('expect.js');
const StackSDK = require('../stack');
const guid = require('mout/random/guid');
const passthru = require('nyks/child_process/passthru');
const path = require('path');
const fs = require('fs');


describe("Stack SDK test suite", function() {

  let stack;

  this.timeout(30 * 1000);


  before("It should ignite a docker stack fixture", async () => {
    await passthru("./test/deploy_swarm");
  });

  before("It should ignite docker stack sdk instance", function() {
    stack = new StackSDK("validation");
  });


  it("Should test config binding", async function() {
    this.timeout(60 * 1000 * 10);

    let uuid = guid();
    let specs = {
      "image" : "debian:bullseye@sha256:2ce44bbc00a79113c296d9d25524e15d423b23303fdbbe20190d2f96e0aeb251",
      "entrypoint" : "/bin/sh",
      "configs" : [{
        "source" : "foo",
        "target" : "/etc/foo"
      }],

      "volumes" : [{
        "type" : "volume",
        "source" : "webfiles",
        "target" : "/var/webfiles",
        "volume" : {
          "nocopy" : true
        }
      }],

      "command" : ["-c", `cat /etc/foo > /var/webfiles/${uuid}`],
    };

    let target = path.join(__dirname, 'volume', uuid);
    const service_payload = await stack.compose_service("trashme", specs);
    await stack.service_exec(service_payload);
    expect(fs.readFileSync(target, "utf8")).to.eql("bar");
    fs.unlinkSync(target);
  });

});


