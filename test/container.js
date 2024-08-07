"use strict";

const expect = require('expect.js');
const StackSDK = require('../stack');
const drain = require('nyks/stream/drain');
const md5 = require('nyks/crypto/md5');
const passthru = require('nyks/child_process/passthru');


describe("Stack SDK test suite", function() {

  let stack;
  this.timeout(30 * 1000);


  before("It should ignite a docker stack fixture", async () => {
    if(!process.env['SKIP_IGNITE'])
      await passthru("./test/deploy_swarm");
  });

  before("It should ignite docker stack sdk instance", function() {
    stack = new StackSDK("validation");
  });






  it("Should test communication with underlying docker server", async  function () {
    let version = await stack.version();
    expect(version.Version).to.be.ok();
    expect(version.ApiVersion).to.be.ok();
  });

  it("Should forward extra_hosts", async function() {

    let specs = {
      "image" : "debian:bullseye@sha256:2ce44bbc00a79113c296d9d25524e15d423b23303fdbbe20190d2f96e0aeb251",
      "entrypoint" : ["cat", "/etc/hosts"],
      "extra_hosts" : [
        "foo=1.1.1.1"
      ]
    };

    const container = await stack.container_run(specs);

    //container.stdout.pipe(process.stderr);
    let end = await container.run();

    expect(String(await drain(container.stdout))).to.match(/^1.1.1.1\s+foo$/m);

    expect(end).to.be(0);
    // console.log(end);
  });


  it("Should do a volume mount", async function() {

    let specs = {
      "image" : "debian:bullseye@sha256:2ce44bbc00a79113c296d9d25524e15d423b23303fdbbe20190d2f96e0aeb251",
      "entrypoint" : ["cat", "/var/webfiles/ping"],

      "volumes" : [{
        "type" : "volume",
        "source" : "webfiles",
        "target" : "/var/webfiles",
        "volume" : {
          "nocopy" : true
        }
      }]
    };

    const container = await stack.container_run(specs);

    //container.stdout.pipe(process.stderr);
    let end = await container.run();

    expect(String(await drain(container.stdout))).to.eql("pong");

    expect(end).to.be(0);
    // console.log(end);
  });


  it("Should do a check stdout behavior", async function() {

    let specs = {
      "image" : "debian:bullseye@sha256:2ce44bbc00a79113c296d9d25524e15d423b23303fdbbe20190d2f96e0aeb251",
      "entrypoint" : ["cat", "/var/webfiles/01395f92b7e79886b4489d3835b69153.jpg"],

      "volumes" : [{
        "type" : "volume",
        "source" : "webfiles",
        "target" : "/var/webfiles",
        "volume" : {
          "nocopy" : true
        }
      }]
    };

    const container = await stack.container_run(specs);

    //container.stdout.pipe(process.stderr);
    let [end, body] = await Promise.all([container.run(), drain(container.stdout)]);

    expect(md5(body)).to.eql("01395f92b7e79886b4489d3835b69153");

    expect(end).to.be(0);
    // console.log(end);
  });


  it("Should do a simple failed docker run", async function() {

    let specs = {
      "image" : "rclone/rclone@sha256:f186eb535186c0da798385e1710e09c9bcfadc2a1efa176959d9462d96d9b8b8",
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
      "environment" : {"FOO" : "BAR"},
      "command" : ["-c", "echo -n $((3+1)); echo -n $FOO 1>&2; exit 0"],
    };

    const container = await stack.container_run(specs);

    let end = await container.run();

    expect(String(await drain(container.stdout))).to.eql("4");
    expect(String(await drain(container.stderr))).to.eql("BAR");

    expect(end).to.be(0);
    // console.log(end);
  });





  it("Should do a simple successful docker run, with a config", async function() {

    this.timeout(10 * 1000 * 60);

    let specs = {
      "image" : "debian:bullseye@sha256:2ce44bbc00a79113c296d9d25524e15d423b23303fdbbe20190d2f96e0aeb251",
      "entrypoint" : ["/bin/bash", "-c", "cat /tmp/foo; echo -n '-'; cat /tmp/bar"],
      "configs" : [{
        "source" : "foo",
        "target" : "/tmp/foo"
      }, {
        "source" : "bar",
        "target" : "/tmp/bar"
      }],
    };

    const container = await stack.container_run(specs);

    let end = await container.run();

    expect(String(await drain(container.stdout))).to.eql("foo-bar");

    expect(end).to.be(0);
    // console.log(end);
  });





  it("Should do a simple curl docker run with a private network", async function() {

    let specs = {
      "image" : "curlimages/curl:7.85.0",
      "command" : "-sS http://http-ping/ping",
      "networks" : ["cluster-test"],
    };

    const container = await stack.container_run(specs);

    container.stderr.pipe(process.stderr);
    let end = await container.run();

    expect(String(await drain(container.stdout))).to.eql("pong");

    expect(end).to.be(0);
    // console.log(end);
  });

});


