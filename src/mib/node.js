import Mib, {MibProviderType} from "./index";
import {ObjectType} from "./object-type";

export default class MibNode {
  constructor(address, parent) {
    this.address = address;
    this.oid = this.address.join(".");
    this.parent = parent;
    this.children = {};
  }
  static oidIsDescended = function oidIsDescended(oid, ancestor) {
    const ancestorAddress = Mib.convertOidToAddress(ancestor);
    const address = Mib.convertOidToAddress(oid);
    let isAncestor = true;
    if (address.length <= ancestorAddress.length) {
      return false;
    }
    ancestorAddress.forEach((o, i) => {
      if (address[i] !== ancestorAddress[i]) {
        isAncestor = false;
      }
    });
    return isAncestor;
  }

  child = (index) => {
    return this.children[index];
  }

  listChildren = (lowest) => {
    const sorted = [];

    lowest = lowest || 0;

    this.children.forEach((c, i) => {
      if (i >= lowest) {
        sorted.push(i);
      }
    });

    sorted.sort((a, b) => a - b);

    return sorted;
  }

  findChildImmediatelyBefore = (index) => {
    const sortedChildrenKeys = Object.keys(this.children).sort((a, b) => a - b);

    if (sortedChildrenKeys.length === 0) {
      return null;
    }

    for (let i = 0; i < sortedChildrenKeys.length; i++) {
      if (index < sortedChildrenKeys[i]) {
        if (i === 0) {
          return null;
        } else {
          return this.children[sortedChildrenKeys[i - 1]];
        }
      }
    }
    return this.children[sortedChildrenKeys[sortedChildrenKeys.length]];
  }

  isDescendant = (address) => {
    return MibNode.oidIsDescended(this.address, address);
  }

  isAncestor = (address) => {
    return MibNode.oidIsDescended(address, this.address);
  }

  getAncestorProvider = () => {
    if (this.provider) {
      return this;
    } else if (!this.parent) {
      return null;
    } else {
      return this.parent.getAncestorProvider();
    }
  }

  getInstanceNodeForTableRow = () => {
    const childCount = Object.keys(this.children).length;
    if (childCount === 0) {
      if (this.value !== null) {
        return this;
      } else {
        return null;
      }
    } else if (childCount === 1) {
      return this.children[0].getInstanceNodeForTableRow();
    } else if (childCount > 1) {
      return null;
    }
    return null;
  }

  getInstanceNodeForTableRowIndex = (index) => {
    const childCount = Object.keys(this.children).length;
    if (childCount === 0) {
      if (this.value !== null) {
        return this;
      } else {
        // not found
        return null;
      }
    } else {
      if (index.length === 0) {
        return this.getInstanceNodeForTableRow();
      } else {
        const nextChildIndexPart = index[0];
        if (nextChildIndexPart === null) {
          return null;
        }
        const remainingIndex = index.slice(1);
        return this.children[nextChildIndexPart].getInstanceNodeForTableRowIndex(remainingIndex);
      }
    }
  }

  getInstanceNodesForColumn = () => {
    const columnNode = this;
    let instanceNode = this;
    const instanceNodes = [];

    while (instanceNode && (instanceNode === columnNode || columnNode.isAncestor(instanceNode.address))) {
      instanceNode = instanceNode.getNextInstanceNode();
      if (instanceNode && columnNode.isAncestor(instanceNode.address)) {
        instanceNodes.push(instanceNode);
      }
    }
    return instanceNodes;
  }

  getNextInstanceNode = () => {
    let node = this;
    if (this.value !== null) {
      // Need upwards traversal first
      node = this;
      while (node) {
        let siblingIndex = node.address.slice(-1)[0];
        node = node.parent;
        if (!node) {
          // end of MIB
          return null;
        } else {
          let childrenAddresses = Object.keys(node.children).sort((a, b) => a - b);
          let siblingPosition = childrenAddresses.indexOf(siblingIndex.toString());
          if (siblingPosition + 1 < childrenAddresses.length) {
            node = node.children[childrenAddresses[siblingPosition + 1]];
            break;
          }
        }
      }
    }
    // Descent
    while (node) {
      if (node.value !== null) {
        return node;
      }
      let childrenAddresses = Object.keys(node.children).sort((a, b) => a - b);
      node = node.children[childrenAddresses[0]];
      if (!node) {
        // unexpected
        return null;
      }
    }
    return null;
  }

  delete = () => {
    if (Object.keys(this.children) > 0) {
      throw new Error("Cannot delete non-leaf MIB node");
    }
    let addressLastPart = this.address.slice(-1)[0];
    delete this.parent.children[addressLastPart];
    this.parent = null;
  }

  pruneUpwards() {
    if (!this.parent) {
      return;
    }
    if (Object.keys(this.children).length === 0) {
      const lastAddressPart = this.address.splice(-1)[0].toString();
      delete this.parent.children[lastAddressPart];
      this.parent.pruneUpwards();
      this.parent = null;
    }
  }

  dump = (options) => {
    let valueString;
    if ((!options.leavesOnly || options.showProviders) && this.provider) {
      console.log(`${this.oid} [${MibProviderType[this.provider.type]}: ${this.provider.name}]`);
    } else if ((!options.leavesOnly) || Object.keys(this.children).length === 0) {
      if (this.value != null) {
        valueString = " = ";
        valueString += options.showTypes ? `${ObjectType[this.valueType]}: ` : "";
        valueString += options.showValues ? this.value : "";
      } else {
        valueString = "";
      }
      console.log(this.oid + valueString);
    }
    for (let node of Object.keys(this.children).sort((a, b) => a - b)) {
      this.children[node].dump(options);
    }
  }
}
