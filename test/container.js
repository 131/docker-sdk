"use strict";

const expect = require('expect.js');
const StackSDK = require('../stack');
const drain = require('nyks/stream/drain');



describe("Stack SDK test suite", function() {

  let stack;
  this.timeout(30 * 1000);

  before("It should ignite docker stack sdk instance", function() {
    stack = new StackSDK("validation");
  });


  it("Should test communication with underlying docker server", async  function () {
    let version = await stack.version();
    expect(version.Version).to.be.ok();
    expect(version.ApiVersion).to.be.ok();
  });

  it("Should do a simple failed docker run", async function() {

    let specs = {
      "image" : "debian:bullseye@sha256:2ce44bbc00a79113c296d9d25524e15d423b23303fdbbe20190d2f96e0aeb251",
      "entrypoint" : "/bin/sh",
      "command" : ["-c", "echo -n $((7+1)); exit 1"],
    };

    const container = await stack.container_run(specs);

    let end = await container.run();
    expect(String(await drain(container.stdout))).to.eql("8");

    expect(end).to.be(1);
    // console.log(end);

  });

  it("Should do a simple successful docker run", async function() {

    let specs = {
      "image" : "debian:bullseye@sha256:2ce44bbc00a79113c296d9d25524e15d423b23303fdbbe20190d2f96e0aeb251",
      "entrypoint" : "/bin/sh",
      "command" : ["-c", "echo -n $((3+1)); echo -n hi 1>&2; exit 0"],
    };

    const container = await stack.container_run(specs);

    let end = await container.run();

    expect(String(await drain(container.stdout))).to.eql("4");
    expect(String(await drain(container.stderr))).to.eql("hi");

    expect(end).to.be(0);
    // console.log(end);

  });
});


