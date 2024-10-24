"use strict";

const expect = require('expect.js');

const applyPlacementConstraints = require('../lib/constraint');


const node_list = [
  {
    ID : 'node1',
    Spec : {
      Role : 'manager',
      Labels : { security : 'high', region : 'us-east' }
    },
    Description : {
      Platform : { OS : 'linux' },
      Hostname : 'docker-metal-ns3198026',

      Engine : {
        Labels : {
          'metal-cluster' : 'true',
          'confluence-data' : '05de2a0d-dfd8-4d8d-ada7-88009b0521b5'
        }
      }
    },

  },
  {
    ID : 'node2',
    Spec : {
      Role : 'worker',
      Labels : { security : 'low', region : 'us-west' }
    },
    Description : {
      Platform : { OS : 'linux' }, Hostname : 'docker-worker-1',
      Engine : { Labels : { 'metal-cluster' : 'true' } }},
  },
  {
    ID : 'node3',
    Spec : {
      Role : 'worker',
      Labels : { security : 'medium', region : 'us-east' }
    },
    Description : {
      Platform : { OS : 'linux' }, Hostname : 'docker-worker-2',
      Engine : {
        Labels : {
          'metal-cluster' : 'false',
          'confluence-data' : 'some-other-uuid'
        }
      }},
  },
  {
    ID : 'node4',
    Spec : {
      Role : 'worker',
      Labels : { security : 'high', region : 'us-west' }
    },
    Description : {
      Platform : { OS : 'linux' }, Hostname : 'docker-worker-3',
      Engine : {
        Labels : {
          'metal-cluster' : 'true',
          'confluence-data' : '05de2a0d-dfd8-4d8d-ada7-88009b0521b5'
        }
      }
    },

  },
  {
    ID : 'node5',
    Spec : {
      Role : 'manager',
      Labels : { security : 'low', region : 'us-east' }
    },
    Description : {
      Platform : { OS : 'windows' }, Hostname : 'docker-manager-1',
      Engine : { Labels : { 'metal-cluster' : 'true' } }
    },
  }
];



describe('Function applyPlacementConstraints', function() {

  it('should filter nodes with constraint node.hostname == docker-metal-ns3198026', function() {
    const constraints = ['node.hostname == docker-metal-ns3198026'];
    const result = applyPlacementConstraints(node_list, constraints);
    expect(result).to.have.length(1);
    expect(result[0].ID).to.equal('node1');
  });

  it('should filter nodes with multiple constraints', function() {
    const constraints = [
      'engine.labels.metal-cluster == true',
      'node.role == worker',
      'engine.labels.confluence-data == 05de2a0d-dfd8-4d8d-ada7-88009b0521b5'
    ];
    const result = applyPlacementConstraints(node_list, constraints);
    expect(result).to.have.length(1);
    expect(result[0].ID).to.equal('node4');
  });

  it('should filter nodes with constraint NOT manager', function() {
    const constraints = ['node.role!=manager'];
    const result = applyPlacementConstraints(node_list, constraints);
    expect(result).to.have.length(3);
    const nodeIDs = result.map(node => node.ID);
    expect(nodeIDs).to.eql(['node2', 'node3', 'node4']);
  });

  it('should filter nodes with constraint node.labels.security == high', function() {
    const constraints = ['node.labels.security == high'];
    const result = applyPlacementConstraints(node_list, constraints);
    expect(result).to.have.length(2);
    const nodeIDs = result.map(node => node.ID);
    expect(nodeIDs).to.contain('node1');
    expect(nodeIDs).to.contain('node4');
  });

  it('should return an empty array if no matches are found', function() {
    const constraints = ['node.platform.os == macos'];
    const result = applyPlacementConstraints(node_list, constraints);
    expect(result).to.be.empty();
  });

  it('should return an empty array for an unsupported constraint key', function() {
    const constraints = ['node.unsupported == value'];
    const result = applyPlacementConstraints(node_list, constraints);
    expect(result).to.be.empty();
  });


  it('should return an empty list on unsupported operator', function() {
    const constraints = ['node.role > worker'];
    const result = applyPlacementConstraints(node_list, constraints);
    expect(result).to.be.empty();
  });
});

