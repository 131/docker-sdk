"use strict";

const debug     = require('debug');
const url       = require('url');

const get       = require('mout/object/get');

const sleep       = require('nyks/async/sleep');
const request     = require('nyks/http/request');
const drain       = require('nyks/stream/drain');

const log = {
  info  : debug("docker-sdk:info"),
  error : debug("docker-sdk:error"),
  debug : debug("docker-sdk:debug"),
};


class DockerSDK {

  constructor(dockerSock = (process.env["DOCKER_HOST"] || {"socketPath" : "/var/run/docker.sock", "host" : "localhost"})) {
    if(typeof dockerSock == "string")
      dockerSock = url.parse(dockerSock);

    this.default_transport_options = {
      ...dockerSock,
      protocol : 'http:',
      reqTimeout : 5 * 1000,
      headers : {
        'Content-Type' : 'application/json',
      }
    };
  }


  async service_exec(service_payload, credentials = null) {

    if(!get(service_payload, "Name"))
      throw `Unable to create empty service name`;

    if(!get(service_payload, "TaskTemplate.ContainerSpec.Image"))
      throw `Unable to create service ${service_payload.Name} without an image`;

    let service = {};

    let current = await this.services_list({name : service_payload.Name});
    if(current.length)
      await this.service_delete(current[0].ID);

    try {
      service = await this.service_create(service_payload, credentials);

    } catch(err) {
      const msg = String(err);
      log.error(msg);
      log.debug(msg,
        get(service_payload, "TaskTemplate.ContainerSpec.Image"),
        get(service_payload, "TaskTemplate.ContainerSpec.Command"),
        get(service_payload, "TaskTemplate.ContainerSpec.Args"),
        get(service_payload, "TaskTemplate.LogDriver.Options.tag"),
        service,
      );
      throw msg;
    }

    log.debug("Created service %s #%s", service_payload.Name, service.ID,
      get(service_payload, "TaskTemplate.ContainerSpec.Image"),
      get(service_payload, "TaskTemplate.ContainerSpec.Command"),
      get(service_payload, "TaskTemplate.ContainerSpec.Args"),
      get(service_payload, "TaskTemplate.LogDriver.Options.tag"),
    );


    log.info("Waiting for service %s tasks to stabilize", service_payload.Name);

    try {
      do {
        const tasks_list = await this.service_tasks(service.ID);

        if(!tasks_list.length) { // too soon
          await sleep(2 * 1000);
          continue;
        }

        const task = tasks_list.shift();
        if(tasks_list.length)
          throw `Pulse service '${service_payload.Name}' tasks must be unary (too many tasks remaining in service #${service.ID})`;

        log.info(`Task in service ${service_payload.Name} is ${task.Status.State} (${task.Status.Message})`);

        if(['complete'].includes(task.Status.State))
          break;

        if(['failed', 'rejected'].includes(task.Status.State))
          throw `Task failed in service ${service_payload.Name}: ${task.Status.Err}`;

        await sleep(2 * 1000);
      } while(true);

    } catch(err) {

      const msg = String(err);
      log.error(msg);
      log.debug(msg,
        get(service_payload, "TaskTemplate.ContainerSpec.Image"),
        get(service_payload, "TaskTemplate.ContainerSpec.Command"),
        get(service_payload, "TaskTemplate.ContainerSpec.Args"),
        get(service_payload, "TaskTemplate.LogDriver.Options.tag"),
      );
      throw msg;

    } finally {

      if(!(get(service_payload, 'TaskTemplate.LogDriver.Name') in ['gelf', 'syslog'])) {
        log.info("Now fetching logs for %s", service_payload.Name);

        const logs_stdout = await this.service_logs(service.ID, true, false);
        if(logs_stdout)
          log.info(logs_stdout);

        const logs_stderr = await this.service_logs(service.ID, false, true);
        if(logs_stderr)
          log.error(logs_stderr);
      }

      log.info("Pruning service %s", service_payload.Name);
      await this.service_delete(service.ID);

    }


  }


  async service_create(service, credentials = null) {

    let image = get(service, "TaskTemplate.ContainerSpec.Image");
    if(!image)
      throw `Service ${service.Name} has no image`;

    log.debug(`Creating service ${service.Name} from image ${image}...`);

    const query = {
      ...this.default_transport_options,
      path : '/services/create',
      json : true,
    };

    if(credentials) {
      query.headers = {
        ...query.headers,
        'X-Registry-Auth' : Buffer.from(JSON.stringify(credentials)).toString('base64'),
      };
    }

    const res  = await request(query, JSON.stringify(service));
    const body = await drain(res);
    if(res.statusCode !== 201)
      throw `Unable to create service ${service.Name}: HTTP ${res.statusCode}, ${body.toString('utf8')}`;

    return JSON.parse(body);
  }


  async service_tasks(service_id) {

    const filters = {
      service : {[service_id] : true},
    };

    const query = {
      ...this.default_transport_options,
      path : '/tasks',
      qs : {filters : JSON.stringify(filters)},
    };

    log.debug(`Checking task status for service ${service_id}...`);

    const res  = await request(query);
    const body = await drain(res);

    if(res.statusCode !== 200)
      throw `Unable to get tasks for service ${service_id}: HTTP ${res.statusCode}, ${body.toString('utf8')}`;

    return JSON.parse(body);
  }



  async secrets_list() {

    const query = {
      ...this.default_transport_options,
      path : '/secrets',
    };

    log.debug(`Checking secrets...`);

    const res  = await request(query);

    if(res.statusCode !== 200)
      throw `Unable to get secrets`;

    const body = await drain(res);
    return JSON.parse(body);
  }

  async configs_list() {

    const query = {
      ...this.default_transport_options,
      path : '/configs',
    };

    log.debug(`Checking configs...`);

    const res  = await request(query);
    if(res.statusCode !== 200)
      throw `Unable to get configs list`;

    const body = await drain(res);
    return JSON.parse(body);
  }


  async services_list({namespace, name} = {}) {
    const filters = {};

    if(namespace)
      filters.label = [`com.docker.stack.namespace=${namespace}`];

    if(name)
      filters.name = [name];

    const query = {
      ...this.default_transport_options,
      path : '/services',
      qs : {filters : JSON.stringify(filters)},
    };

    log.debug(`Getting services list in ${JSON.stringify(filters)}...`);

    const res  = await request(query);
    const body = await drain(res);
    if(res.statusCode !== 200)
      throw `Unable to get services for ${namespace}: HTTP ${res.statusCode}, ${body.toString('utf8')}`;

    return JSON.parse(body);
  }


  async service_logs(service_id, stdout, stderr) {
    const params = {
      stdout, stderr,
      timestamps : true,
      // details: true,
    };

    const query = {
      ...this.default_transport_options,
      path : `/services/${service_id}/logs`,
      qs : params,
    };

    log.debug(`Fetching ${stdout && stderr ? 'all' : stdout ? 'stdout' : 'stderr'} logs for service ${service_id}...`);

    const res  = await request(query);
    const body = await drain(res);
    if(res.statusCode !== 200)
      throw `Unable to get logs for service ${service_id}: HTTP ${res.statusCode}, ${body.toString('utf8')}`;

    return body.toString('utf8').trim();
  }


  async service_delete(service_id) {
    const query = {
      ...this.default_transport_options,
      path   : `/services/${service_id}`,
      method : 'DELETE',
    };

    log.debug(`Removing service ${service_id}...`);

    const res = await request(query);
    if(![200, 404].includes(res.statusCode))
      throw `Cannot delete service ${service_id}`;
  }


}

module.exports = DockerSDK;
