"use strict";

const debug     = require('debug');


const log = {
  info  : debug("docker-sdk:info"),
  error : debug("docker-sdk:error"),
  debug : debug("docker-sdk:debug"),
};

// Generic comparison function
function compare(left, right, operator) {
  switch(operator) {
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    default:
      return false;
  }
}

// Function to apply placement constraints on nodes
function applyPlacementConstraints(node_list, constraints) {
  return node_list.filter(node => {
    return constraints.every(constraint => {
      // Parse the constraint
      const match = constraint.match(/(.+?)\s*(==|!=)\s*(.+)/);
      if(!match)
        return log.info("Unsupported constraint operator", constraint), false;

      const [, leftKey, operator, rightValue] = match;
      let leftValue;

      // Extract the left value based on the key
      if(leftKey === 'node.role') {
        leftValue = node.Spec.Role;
      } else if(leftKey === 'node.platform.os') {
        leftValue = node.Description.Platform.OS;
      } else if(leftKey === 'node.hostname') {
        leftValue = node.Description.Hostname;
      } else if(leftKey.startsWith('engine.labels.')) {
        const labelKey = leftKey.replace('engine.labels.', '');
        leftValue = node.Description.Engine && node.Description.Engine.Labels && node.Description.Engine.Labels[labelKey];
      } else if(leftKey.startsWith('node.labels.')) {
        const labelKey = leftKey.replace('node.labels.', '');
        leftValue = node.Spec.Labels && node.Spec.Labels[labelKey];
      } else {
        return log.info("Unsupported constraint operand", constraint), false;
      }

      return compare(leftValue, rightValue, operator);
    });
  });
}


module.exports = applyPlacementConstraints;
