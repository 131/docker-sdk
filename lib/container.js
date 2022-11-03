class Container  {

  constructor() {

  }


  async attach() {
    let id = this.stack.request("POST", `/containers/{id}/attach?`, payload);

  }


  async run(payload) {

    let id = await  this.stack.request("POST", `/containers/create`, payload);

//    this.stdout = await this.attach(??);
//    this.stderr = await this.attach(??);

    let end =  this.stack.request("POST", `/containers/{id}/wait`, {condition : "removed"});

    await this.stack.request("POST", `/containers/{id}/start`, payload);

    return end;
  }

}