"use strict";

const debug     = require('debug');

const get       = require('mout/object/get');
const set       = require('mout/object/set');
const trim      = require('mout/string/trim');


const sleep     = require('nyks/async/sleep');
const drain     = require('nyks/stream/drain');
const md5       = require('nyks/crypto/md5');
const splitArgs = require('nyks/process/splitArgs');


const Container = require('./lib/container');
const Images    = require('./lib/images');
const Modem     = require('./lib/modem');

const log = {
  info  : debug("docker-sdk:info"),
  error : debug("docker-sdk:error"),
  debug : debug("docker-sdk:debug"),
};

const noop = input => input;

const escape = (input, prefix = '') => {
  let name = trim(input.replace(/[^a-z0-9_-]/gi, '_').replace(/_+/g, '_'), '_');
  return `${(prefix + name).substring(0, 63 - 6 - 6)}_${md5(input).substring(0, 5)}`;
};

const DEFAULT_DOCKER_HOST = process.platform == "win32" ? "npipe:////./pipe/docker_engine" : "unix:///var/run/docker.sock";

class StackSDK {

  constructor(stack_name = (process.env['STACK_NAME'] || ''), dockerSock = (process.env["DOCKER_HOST"] || DEFAULT_DOCKER_HOST)) {

    let modem =  new Modem(dockerSock);
    this.request = modem.request;
    this.STACK_NAME = stack_name;
    this.images     = new Images(this);
  }

  async container_run(specs, registry_auth) {
    const payload = await this.compose_run(specs);
    await this.images.check_pull(payload.Image, registry_auth);

    const container = new Container(this, payload);
    return container;
  }

  async compose_run(specs) {

    let {
      command,
      image,
      working_dir,
      entrypoint,
      volumes : volumes_specs,
      networks : networks_specs,
      environment : env_specs,
    } = specs;

    if(!image)
      throw `Missing image for docker run`;




    let environment = [];
    for(const [key, value] of Object.entries(env_specs || {}))
      environment.push(`${key}=${value}`);

    command    = typeof command == "string"    ? splitArgs(command).map(String)    : command;
    entrypoint = typeof entrypoint == "string" ? splitArgs(entrypoint).map(String) : entrypoint;

    let networks = {};
    if(networks_specs) {
      for(const network of networks_specs) {
        networks[`${this.STACK_NAME}_${network}`] = {
          IPAMConfig : null,
          Links : null,
          Aliases : [],
        };
      }
    }


    let mounts = [];
    if(volumes_specs) {
      for(const volume of volumes_specs) {
        let mnt = {};

        if(typeof volume === 'string') {
          const [source, target] = volume.split(':');
          mnt = {
            'Type'  : 'bind',
            'Source' : `${this.STACK_NAME}_${source}`,
            'Target' : target,
          };
        }

        else {
          mnt = {
            'Type'  : volume.type,
            'Source' : `${this.STACK_NAME}_${volume.source}`,
            'Target' : volume.target,
          };

          if('read_only' in volume)
            mnt.ReadOnly = !!volume.read_only;

          if('volume' in volume && 'nocopy' in volume.volume)
            mnt.VolumeOptions = {'NoCopy' : !!volume.volume.nocopy};
        }

        mounts.push(mnt);
      }
    }
    /*
    let binds = [];
    if(volumes_specs) {
      for(const volume of volumes_specs) {
        let bind = "";

        if(typeof volume === 'string') {
          const [source, target] = volume.split(':');
          bind = `${this.STACK_NAME}_${source}:${target}`;
        }

        else {
          let opts = [];
          bind = `${this.STACK_NAME}_${volume.source}:${volume.target}`;

          if('read_only' in volume)
            opts.push("ro");

          if('volume' in volume && 'nocopy' in volume.volume)
            opts.push("nocopy");
          if(opts.length)
            bind += ":" + opts.join(',');
        }

        binds.push(bind);
      }
    }
*/


    const labels = {
      "com.docker.stack.namespace" : this.STACK_NAME,
    };

    const container_payload =  {

      "AttachStdin" : false,
      "AttachStdout" : true,
      "AttachStderr" : true,

      "Env" : environment,
      //"Name" : name,
      "Labels" : labels,

      "Entrypoint" : entrypoint,
      "Cmd" :  command,

      "Image" : image,

      "HostConfig" : {
        "Mounts" : mounts,
        "AutoRemove" : true,
        "ReadonlyRootfs" : false,
      },

      "WorkingDir" : working_dir,
      "NetworkingConfig" : {
        "EndpointsConfig" : networks
      },
    };

    //console.log(JSON.stringify(container_payload, null, 2));
    return container_payload;
  }



  async ping() {
    let res = await this.request("GET", "/_ping");
    return String(await drain(res));
  }


  async version() {
    const res = await this.request("GET", "/version");
    if(res.statusCode != 200)
      throw `Invalid response for /version`;

    return JSON.parse(await drain(res));
  }

  async compose_service(task_name, specs, deploy_ns = this.STACK_NAME) {

    let {
      command,
      image,
      working_dir,
      entrypoint,
      volumes : volumes_specs,
      dns,
      cap_add,
      networks : networks_specs,
      logging : logging_specs,
      environment : env_specs,
      secrets : secrets_specs,
      configs : configs_specs,
      deploy : deploy_specs,
    } = specs;

    if(!image)
      throw `Missing image for task ${task_name}`;


    let name = escape(task_name);

    // @todo: implement the rest of the "deploy" spec
    let placement_constraints = get(deploy_specs || {}, "placement.constraints");
    if(!Array.isArray(placement_constraints))
      placement_constraints = null;

    const labels = {
      "com.docker.stack.namespace" : deploy_ns,
    };

    let environment = [];
    for(const [key, value] of Object.entries(env_specs || {}))
      environment.push(`${key}=${value}`);

    command    = typeof command == "string"    ? splitArgs(command).map(String)    : command;
    entrypoint = typeof entrypoint == "string" ? splitArgs(entrypoint).map(String) : entrypoint;

    let networks = [];
    if(networks_specs) {
      for(const network of networks_specs) {
        let Target = network == "host" ? "host" : `${this.STACK_NAME}_${network}`;
        networks.push({Target});
      }
    }


    let secrets = [];
    if(secrets_specs) {
      let secrets_map = await this.secrets_list();
      for(let secret of secrets_specs) {
        if(typeof secret == "string")
          secret = { source : secret};

        let {source : SecretName, mode : Mode, uid : UID, gid : GID, target : Name} = {target : secret.source, uid : "0", gid : "0", mode : 0o444, ...secret};
        let {ID : SecretID}  = secrets_map.find(secret => secret.Spec.Name == SecretName) || {};

        if(!SecretID)
          throw `Cannot lookup secret ${SecretName}`;

        secrets.push({SecretID, SecretName, File : {Name, UID, GID, Mode}});
      }
    }

    let configs = [];
    if(configs_specs) {
      let configs_map = await this.configs_list();
      for(let config of configs_specs) {
        let {source : ConfigName, mode : Mode, uid : UID, gid : GID, target : Name} = {target : config.source, uid : "0", gid : "0", mode : 0o444, ...config};
        ConfigName = `${this.STACK_NAME}_${ConfigName}`;
        let {ID : ConfigID}  = configs_map.find(config => config.Spec.Name == ConfigName) || {};

        if(!ConfigID)
          throw `Cannot lookup config ${ConfigName}`;

        configs.push({ConfigID, ConfigName, File : {Name, UID, GID, Mode}});
      }
    }


    let mounts = [];
    if(volumes_specs) {
      let volumes_map = await this.volumes_list();

      for(const volume of volumes_specs) {
        let mnt = {};

        if(typeof volume === 'string') {
          const [source, target] = volume.split(':');
          mnt = {
            'Type'  : 'bind',
            'Source' : `${this.STACK_NAME}_${source}`,
            'Target' : target,
          };
        }

        else {
          let VolumeName   = `${this.STACK_NAME}_${volume.source}`;
          let Volume  = volumes_map.Volumes.find(volume => volume.Name == VolumeName);

          if(!Volume)
            throw `Cannot lookup volume ${VolumeName}`;

          let DriverConfig = {
            'Name'    : Volume.Driver,
            'Options' : Volume.Options
          };

          mnt = {
            'Type'  : volume.type,
            'Source' : VolumeName,
            'Target' : volume.target,
            'VolumeOptions' : { 'Labels' : labels, DriverConfig },
          };

          if('read_only' in volume)
            mnt.ReadOnly = !!volume.read_only;

          if('volume' in volume && 'nocopy' in volume.volume)
            mnt.VolumeOptions.NoCopy = !!volume.volume.nocopy;


        }


        mounts.push(mnt);
      }
    }


    let logging = {};
    if(logging_specs) {
      logging.Name = logging_specs.driver;
      if(logging_specs.options)
        logging.Options = {"tag" : name, ...logging_specs.options};
    }


    const service_payload =  {
      "Name" : name,
      "Labels" : labels,

      "TaskTemplate" : {
        "ContainerSpec" : {
          "Image" : image,
          "Labels" : labels,
          "Env" : environment,
          "Mounts" : mounts,
          "Secrets" : secrets,
          "Configs" : configs,
        },

        "NetworkAttachmentSpec" : {},
        "Resources" :  {},
        "RestartPolicy" : { "Condition" : "none"},
        "Placement" : {"Constraints" : placement_constraints},
        "ForceUpdate" : 0,
        "ReadOnly" : true,
        "LogDriver" : logging,
      },

      "Mode" : {
        //"replicated-job is still unstable feature: see moby/moby/issues/42789, moby/moby/issues/42742, moby/moby/issues/42741
        "Replicated" : {"Replicas" : 1},
      },

      "Networks" : networks,
    };

    if(entrypoint)
      set(service_payload, "TaskTemplate.ContainerSpec.Command", entrypoint);

    if(command)
      set(service_payload, "TaskTemplate.ContainerSpec.Args", command);

    if(working_dir)
      set(service_payload, "TaskTemplate.ContainerSpec.Dir", working_dir);

    if(cap_add) {
      if(typeof cap_add == "string")
        cap_add = [cap_add];
      set(service_payload, "TaskTemplate.ContainerSpec.CapabilityAdd", cap_add);
    }

    if(dns) {
      if(typeof dns == "string")
        dns = [dns];
      set(service_payload, "TaskTemplate.ContainerSpec.DNSConfig.Nameservers", dns);
    }

    // console.log(JSON.stringify(service_payload, null, 2));
    return service_payload;

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

    let traceID = `${service_payload.Name}#${service.ID}`;

    log.debug("Created service %s", traceID,
      get(service_payload, "TaskTemplate.ContainerSpec.Image"),
      get(service_payload, "TaskTemplate.ContainerSpec.Command"),
      get(service_payload, "TaskTemplate.ContainerSpec.Args"),
      get(service_payload, "TaskTemplate.LogDriver.Options.tag"),
    );


    log.info("Waiting for service '%s' tasks to stabilize", traceID);

    let delay = 2;

    try {
      do {
        const tasks_list = await this.service_tasks(service.ID);

        if(!tasks_list.length) { // too soon
          await sleep(2 * 1000);
          continue;
        }

        const task = tasks_list.shift();
        if(tasks_list.length)
          throw `Pulse service '${traceID}' tasks must be unary (too many tasks remaining in service #${traceID})`;

        log.info(`Task in service ${traceID} is ${task.Status.State} (${task.Status.Message}) (wait delay is %ds)`, delay);

        if(['complete'].includes(task.Status.State))
          break;

        if(['failed', 'rejected', 'shutdown'].includes(task.Status.State))
          throw `Task failed in service ${traceID}: ${task.Status.Err}`;

        if(delay < 60)
          delay++;

        await sleep(delay * 1000);
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

      if(!(['gelf', 'syslog'].includes(get(service_payload, 'TaskTemplate.LogDriver.Name')))) {
        log.info("Now fetching logs for %s", traceID);

        const logs_stdout = await this.service_logs(service.ID, true, false);
        if(logs_stdout)
          log.info(logs_stdout);

        const logs_stderr = await this.service_logs(service.ID, false, true);
        if(logs_stderr)
          log.error(logs_stderr);
      }

      log.info("Pruning service %s", traceID);
      await this.service_delete(service.ID);

    }


  }


  async service_create(service, credentials = null) {

    let image = get(service, "TaskTemplate.ContainerSpec.Image");
    if(!image)
      throw `Service ${service.Name} has no image`;

    log.debug(`Creating service ${service.Name} from image ${image}...`);

    const query = {
      path : '/services/create',
    };

    if(credentials) {
      query.headers = {
        'X-Registry-Auth' : Buffer.from(JSON.stringify(credentials)).toString('base64'),
      };
    }

    const res  = await this.request("POST", query, service);
    const body = await drain(res);
    if(res.statusCode !== 201)
      throw `Unable to create service ${service.Name}: HTTP ${res.statusCode}, ${body.toString('utf8')}`;

    return JSON.parse(body);
  }


  async service_tasks(service_id, desired_state = null) {

    const filters = {
      service : {[service_id] : true},
    };
    if(desired_state)
      filters['desired-state'] = {[desired_state] : true};

    log.debug(`Checking task status for service ${service_id}...`, filters);
    const res  = await this.request("GET", {path : '/tasks', qs : {filters : JSON.stringify(filters)}});
    const body = await drain(res);

    if(res.statusCode !== 200)
      throw `Unable to get tasks for service ${service_id}: HTTP ${res.statusCode}, ${body.toString('utf8')}`;

    return JSON.parse(body);
  }



  async secrets_list() {

    log.debug(`Checking secrets...`);

    const res  = await this.request("GET", '/secrets');

    if(res.statusCode !== 200)
      throw `Unable to get secrets`;

    const body = await drain(res);
    return JSON.parse(body);
  }

  async service_inspect(service_name) {
    const res  = await this.request("GET", {path : `/services/${this.STACK_NAME}_${service_name}`});
    const body = await drain(res);
    if(res.statusCode !== 200)
      throw `Unable to get service for ${service_name}: HTTP ${res.statusCode}, ${body.toString('utf8')}`;
    return JSON.parse(body);
  }

  async service_labels_read(service_name) {
    let service = await  this.service_inspect(service_name).catch(() => "");
    return get(service, 'Spec.Labels') || {};
  }

  async service_label_write(service_name, label, value) {
    await this.service_update(service_name, Spec => (Spec.Labels[label] = value, Spec));
  }

  async service_update(service_name, transform = noop) {
    let {Spec, Version : { Index : version }} = await this.service_inspect(service_name);

    let payload = await transform(Spec);

    const res  = await this.request("POST", {path : `/services/${this.STACK_NAME}_${service_name}/update`, qs : {version}}, payload);
    const body = await drain(res);
    if(res.statusCode !== 200)
      throw `Unable to update service ${service_name} HTTP ${res.statusCode}, ${body.toString('utf8')}`;

    return JSON.parse(body);
  }


  config_read(name) {
    if(typeof name == 'string')
      name = {name};

    return this.configs_list(name).then(list => list[0] ? String(Buffer.from(list[0].Spec.Data, 'base64')) : null);
  }


  async config_write(name, value, Labels = {}) {
    //name with contains {name, namespace}
    if(typeof name == 'string')
      name = {name};

    let current = await this.configs_list(name).then(list => list[0]);

    if(current) {
      let {ID} = current;
      const res  = await this.request('DELETE', `/configs/${ID}`);
      if(res.statusCode !== 204)
        throw `Unable to update ${name} (old version delete failure)`;
    }

    if(name.namespace)
      Labels['com.docker.stack.namespace'] = name.namespace;

    let payload = {Name : name.name, Labels, Data : Buffer.from(value).toString('base64')};
    const res  = await this.request('POST', '/configs/create', payload);
    const body = await drain(res);
    if(res.statusCode !== 201) {
      log.error(String(body));
      throw `Unable to write config ${name}`;
    }

    return JSON.parse(body);
  }

  async volumes_list({name, namespace} = {}) {
    const filters = {};

    if(namespace)
      filters.label = [`com.docker.stack.namespace=${namespace}`];

    if(name)
      filters.name = [name];

    const res  = await this.request('GET', {path : '/volumes', qs : {filters : JSON.stringify(filters)}});
    const body = await drain(res);
    if(res.statusCode !== 200)
      throw `Unable to get configs list ${String(body)}`;

    return JSON.parse(body);
  }

  async configs_list({id, name, namespace, label} = {}) {
    const filters = {label : []};

    if(namespace)
      filters.label.push(`com.docker.stack.namespace=${namespace}`);
    if(id)
      filters.id = [id];
    if(name)
      filters.name = [name];
    if(label)
      filters.label.push(...(Array.isArray(label) ? label : [label]));

    log.debug(`Checking configs...`, filters);

    const res  = await this.request('GET', {path : '/configs', qs : {filters : JSON.stringify(filters)}});
    const body = await drain(res);
    if(res.statusCode !== 200)
      throw `Unable to get configs list ${String(body)}`;

    return JSON.parse(body);
  }

  async nodes_list({id} = {}) {
    const filters = {};
    if(id)
      filters.id = [id];

    const res  = await this.request("GET", {path : '/nodes', qs : {filters : JSON.stringify(filters)}});
    const body = await drain(res);
    if(res.statusCode !== 200)
      throw `Unable to get nodes ${res.statusCode}, ${body.toString('utf8')}`;

    let response = JSON.parse(body);
    return response;
  }

  async services_list({namespace, name} = {}) {
    const filters = {};
    const regExpMode = name instanceof RegExp;

    if(namespace)
      filters.label = [`com.docker.stack.namespace=${namespace}`];

    if(name && !regExpMode)
      filters.name = [name];

    log.debug(`Getting services list in ${JSON.stringify(filters)}...`);

    const res  = await this.request("GET", {path : '/services', qs : {filters : JSON.stringify(filters)}});
    const body = await drain(res);
    if(res.statusCode !== 200)
      throw `Unable to get services for ${namespace}: HTTP ${res.statusCode}, ${body.toString('utf8')}`;

    let response = JSON.parse(body);

    return response.filter(regExpMode ? ({Spec : {Name}}) => name.test(Name) : () => true);
  }


  async service_logs(service_id, stdout, stderr) {
    const params = {
      stdout, stderr,
      timestamps : true,
      // details: true,
    };

    log.debug(`Fetching ${stdout && stderr ? 'all' : stdout ? 'stdout' : 'stderr'} logs for service ${service_id}...`);

    const res  = await this.request("GET", {path : `/services/${service_id}/logs`, qs : params});
    const body = await drain(res);
    if(res.statusCode !== 200)
      throw `Unable to get logs for service ${service_id}: HTTP ${res.statusCode}, ${body.toString('utf8')}`;

    return body.toString('utf8').trim();
  }


  async service_delete(service_id) {
    log.debug(`Removing service ${service_id}...`);
    const res = await this.request('DELETE', `/services/${service_id}`);

    if(![200, 404].includes(res.statusCode))
      throw `Cannot delete service ${service_id}`;
  }

  async monitor({type}, cb) {
    const idle_timeout = 60 * 1000;
    var lastEventTime;

    do {

      let filters = {
        "type" : { [type] : true },
        "labels" : { 'dspp.task.name' : true },
      };

      log.info("REquest since", lastEventTime);
      let res  = await this.request("GET", {path : '/events', qs : {since : lastEventTime, filters : JSON.stringify(filters)}});

      const {push, clear} = setPushTimeout(() => {
        res.destroy();
      }, idle_timeout);

      res.on("error", function(err) {
        log.error("Got error from monitor", err);
      });

      if(res.statusCode !== 200) {
        let body = await drain(res);
        log.error(`Unable to monitor eventsHTTP ${res.statusCode}, ${body.toString('utf8')}`);
        clear();
        await sleep(10 * 1000); //wait before retry
        continue;
      }

      res.on("data", function(chunk) {
        try {
          let body = JSON.parse(chunk);
          lastEventTime = body.time + 1;
          cb(body);
          push();
        } catch(err) {}
      });

      await new Promise(resolve => res.once("close", resolve));
      clear(); //make sure timeout is cleared
    } while(true);

  }

}

const setPushTimeout = (cb, timeout) => {
  let t;
  const clear = () => clearTimeout(t);
  const end   = () => (clear(), cb());
  const push = () => {
    clear();
    t = setTimeout(cb, timeout);
  };
  return push(), {push, clear, end};
};

module.exports = StackSDK;
module.exports.escape = escape;
