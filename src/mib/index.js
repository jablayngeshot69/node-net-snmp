

import MibNode from "./node";
import ObjectType from "./object-type";
var MAX_INT32 = 2147483647;

export const MibProviderType = {
  "1": "Scalar",
  "2": "Table",
  "Scalar": "1",
  "Table": "2",
};

export default class Mib {
  constructor() {
    this.root = new MibNode([], null);
    this.providers = {};
    this.providerNodes = {};
  }
  static convertOidToAddress = function convertOidToAddress(oid) {
    let address;
    let oidArray;
    let i;
    if (typeof (oid) === "object" && Array.isArray(oid)) {
      address = oid;
    } else if (typeof (oid) === "string") {
      address = oid.split(".");
    } else {
      throw new TypeError("oid (string or array) is required");
    }
    if (address.length < 1) {
      throw new RangeError("object identifier is too short");
    }
    oidArray = [];
    for (i = 0; i < address.length; i++) {
      let n;
      if (address[i] === "") {
        continue;
      }
      if (address[i] === true || address[i] === false) {
        throw new TypeError(`object identifier component ${address[i]} is malformed`);
      }
      n = Number(address[i]);
      if (isNaN(n)) {
        throw new TypeError(`object identifier component ${address[i]} is malformed`);
      }
      if (n % 1 !== 0) {
        throw new TypeError(`object identifier component ${address[i]} is not an integer`);
      }
      if (i === 0 && n > 2) {
        throw new RangeError("object identifier does not " +
          "begin with 0, 1, or 2");
      }
      if (i === 1 && n > 39) {
        throw new RangeError(`object identifier second component ${n} exceeds encoding limit of 39`);
      }
      if (n < 0) {
        throw new RangeError(`object identifier component ${address[i]} is negative`);
      }
      if (n > MAX_INT32) {
        throw new RangeError(`object identifier component ${address[i]} is too large`);
      }
      oidArray.push(n);
    }
    return oidArray;
  }
  static getSubOidFromBaseOid = function getSubOidFromBaseOid(oid, {length}) {
    return oid.substring(length + 1);
  }

  addNodesForOid = (oidString) => {
    const address = Mib.convertOidToAddress(oidString);
    return this.addNodesForAddress(address);
  }

  addNodesForAddress = (address) => {
    let node = this.root;
    for (let i = 0; i < address.length; i++) {
      if (!node.children.hasOwnProperty(address[i])) {
        node.children[address[i]] = new MibNode(address.slice(0, i + 1), node);
      }
      node = node.children[address[i]];
    }
    return node;
  }

  lookup = (oid) => {
    let address = Mib.convertOidToAddress(oid);
    return this.lookupAddress(address);
  }

  lookupAddress = (address) => {
    let node = this.root;
    for (let i = 0; i < address.length; i++) {
      if (!node.children.hasOwnProperty(address[i])) {
        return null;
      }
      node = node.children[address[i]];
    }
    return node;
  }

  getTreeNode = (oid) => {
    const address = Mib.convertOidToAddress(oid);
    let node = this.lookupAddress(address);
    // OID already on tree
    if (node) {
      return node;
    }

    while (address.length > 0) {
      let last = address.pop();
      let parent = this.lookupAddress(address);
      if (parent) {
        return (parent.findChildImmediatelyBefore(last) || parent);
      }
    }
    return this.root;

  }

  getProviderNodeForInstance(instanceNode) {
    if (instanceNode.provider) {
      // throw new ReferenceError ("Instance node has provider which should never happen");
      return null;
    }
    return instanceNode.getAncestorProvider();
  }

  addProviderToNode = (provider) => {
    const node = this.addNodesForOid(provider.oid);

    node.provider = provider;
    if (provider.type === MibProviderType.Table) {
      if (!provider.tableIndex) {
        provider.tableIndex = [1];
      }
    }
    this.providerNodes[provider.name] = node;
    return node;
  }

  getColumnFromProvider({tableColumns}, {columnName, columnNumber}) {
    let column = null;
    if (columnName) {
      column = tableColumns.filter(({name}) => name === columnName)[0];
    } else if (columnNumber !== undefined && columnNumber !== null) {
      column = tableColumns.filter(({number}) => number === columnNumber)[0];
    }
    return column;
  }

  populateIndexEntryFromColumn = (localProvider, indexEntry, i) => {
    let column = null;
    let tableProviders;
    if (!indexEntry.columnName && !indexEntry.columnNumber) {
      throw new Error(`Index entry ${i}: does not have either a columnName or columnNumber`);
    }
    if (indexEntry.foreign) {
      // Explicit foreign table is first to search
      column = this.getColumnFromProvider(this.providers[indexEntry.foreign], indexEntry);
    } else {
      // If foreign table isn't given, search the local table next
      column = this.getColumnFromProvider(localProvider, indexEntry);
      if (!column) {
        // as a last resort, try to find the column in a foreign table
        tableProviders = Object.values(this.providers).
          filter(({type}) => type === MibProviderType.Table);
        for (const provider of tableProviders) {
          column = this.getColumnFromProvider(provider, indexEntry);
          if (column) {
            indexEntry.foreign = provider.name;
            break;
          }
        }
      }
    }
    if (!column) {
      throw new Error(`Could not find column for index entry with column ${indexEntry.columnName}`);
    }
    if (indexEntry.columnName && indexEntry.columnName !== column.name) {
      throw new Error(`Index entry ${i}: Calculated column name ${column.name}does not match supplied column name ${indexEntry.columnName}`);
    }
    if (indexEntry.columnNumber && indexEntry.columnNumber !== column.number) {
      throw new Error(`Index entry ${i}: Calculated column number ${column.number} does not match supplied column number ${indexEntry.columnNumber}`);
    }
    if (!indexEntry.columnName) {
      indexEntry.columnName = column.name;
    }
    if (!indexEntry.columnNumber) {
      indexEntry.columnNumber = column.number;
    }
    indexEntry.type = column.type;

  }

  registerProvider = (provider) => {
    this.providers[provider.name] = provider;
    if (provider.type === MibProviderType.Table) {
      if (provider.tableAugments) {
        if (provider.tableAugments === provider.name) {
          throw new Error(`Table ${provider.name} cannot augment itself`);
        }
        let augmentProvider = this.providers[provider.tableAugments];
        if (!augmentProvider) {
          throw new Error(`Cannot find base table ${provider.tableAugments} to augment`);
        }
        //TODO alternative for deepclone?
        provider.tableIndex = JSON.parse(JSON.stringify(augmentProvider.tableIndex));
        //TODO change this to a for loop?
        provider.tableIndex.forEach((el, i) => {
          provider.tableIndex[i].foreign = augmentProvider.name;
        });
      } else {
        if (!provider.tableIndex) {
          provider.tableIndex = [1]; // default to first column index
        }
        for (let i = 0; i < provider.tableIndex.length; i++) {
          let indexEntry = provider.tableIndex[i];
          if (typeof indexEntry === "number") {
            provider.tableIndex[i] = {
              columnNumber: indexEntry,
            };
          } else if (typeof indexEntry === "string") {
            provider.tableIndex[i] = {
              columnName: indexEntry,
            };
          }
          indexEntry = provider.tableIndex[i];
          this.populateIndexEntryFromColumn(provider, indexEntry, i);
        }
      }
    }
  }

  registerProviders = (providers) => {
    for (const provider of providers) {
      this.registerProvider(provider);
    }
  }

  unregisterProvider = (name) => {
    const providerNode = this.providerNodes[name];
    if (providerNode) {
      providerNode.delete();
      providerNode.parent.pruneUpwards();
      delete this.providerNodes[name];
    }
    delete this.providers[name];
  }

  getProvider = (name) => {
    return this.providers[name];
  }

  getProviders = () => {
    return this.providers;
  }

  dumpProviders = () => {
    let extraInfo;
    for (const provider of Object.values(this.providers)) {
      extraInfo = provider.type === MibProviderType.Scalar ? ObjectType[provider.scalarType] : `Columns = ${provider.tableColumns.length}`;
      console.log(`${MibProviderType[provider.type]}: ${provider.name} (${provider.oid}): ${extraInfo}`);
    }
  }

  getScalarValue = (scalarName) => {
    const providerNode = this.providerNodes[scalarName];
    if (!providerNode || !providerNode.provider || providerNode.provider.type !== MibProviderType.Scalar) {
      throw new ReferenceError(`Failed to get node for registered MIB provider ${scalarName}`);
    }
    const instanceAddress = providerNode.address.concat([0]);
    if (!this.lookup(instanceAddress)) {
      throw new Error(`Failed created instance node for registered MIB provider ${scalarName}`);
    }
    const instanceNode = this.lookup(instanceAddress);
    return instanceNode.value;
  }

  setScalarValue = (scalarName, newValue) => {
    let providerNode;
    let instanceNode;

    if (!this.providers[scalarName]) {
      throw new ReferenceError(`Provider ${scalarName} not registered with this MIB`);
    }

    providerNode = this.providerNodes[scalarName];
    if (!providerNode) {
      providerNode = this.addProviderToNode(this.providers[scalarName]);
    }
    if (!providerNode || !providerNode.provider || providerNode.provider.type !== MibProviderType.Scalar) {
      throw new ReferenceError(`Could not find MIB node for registered provider ${scalarName}`);
    }
    const instanceAddress = providerNode.address.concat([0]);
    instanceNode = this.lookup(instanceAddress);
    if (!instanceNode) {
      this.addNodesForAddress(instanceAddress);
      instanceNode = this.lookup(instanceAddress);
      instanceNode.valueType = providerNode.provider.scalarType;
    }
    instanceNode.value = newValue;
  }

  getProviderNodeForTable = (table) => {
    let providerNode;
    let provider;

    providerNode = this.providerNodes[table];
    if (!providerNode) {
      throw new ReferenceError(`No MIB provider registered for ${table}`);
    }
    provider = providerNode.provider;
    if (!providerNode) {
      throw new ReferenceError(`No MIB provider definition for registered provider ${table}`);
    }
    if (provider.type !== MibProviderType.Table) {
      throw new TypeError(`Registered MIB provider ${table} is not of the correct type (is type ${MibProviderType[provider.type]})`);
    }
    return providerNode;
  }

  getOidAddressFromValue(value, {type, implied, length}) {
    let oidComponents;
    switch (type) {
      case ObjectType.OID:
        oidComponents = value.split(".");
        break;
      case ObjectType.OctetString:
        oidComponents = [...value].map(c => c.charCodeAt());
        break;
      case ObjectType.IpAddress:
        return value.split(".");
      default:
        return [value];
    }
    if (!implied && !length) {
      oidComponents.unshift(oidComponents.length);
    }
    return oidComponents;
  }

  getValueFromOidAddress(oid, indexPart) {
    throw "Not Implemented";
  }

  getTableRowInstanceFromRow = ({tableIndex, tableColumns}, row) => {
    let rowIndex = [];
    let foreignColumnParts;
    let localColumnParts;
    let localColumnPosition;
    let oidArrayForValue;

    // foreign columns are first in row
    foreignColumnParts = tableIndex.filter(({foreign}) => foreign);
    for (let i = 0; i < foreignColumnParts.length; i++) {
      //rowIndex.push (row[i]);
      oidArrayForValue = this.getOidAddressFromValue(row[i], foreignColumnParts[i]);
      rowIndex = rowIndex.concat(oidArrayForValue);
    }
    // then local columns
    localColumnParts = tableIndex.filter(({foreign}) => !foreign);
    for (const localColumnPart of localColumnParts) {
      localColumnPosition = tableColumns.findIndex(({number}) => number === localColumnPart.columnNumber);
      oidArrayForValue = this.getOidAddressFromValue(row[foreignColumnParts.length + localColumnPosition], localColumnPart);
      rowIndex = rowIndex.concat(oidArrayForValue);
    }
    return rowIndex;
  }

  getRowIndexFromOid(oid, index) {
    const addressRemaining = oid.split(".");
    let length = 0;
    const values = [];
    for (let indexPart of index) {
      let value;
      switch (indexPart.type) {
        case ObjectType.OID:
          if (indexPart.implied) {
            length = addressRemaining.length;
          } else {
            length = addressRemaining.shift();
          }
          value = addressRemaining.splice(0, length);
          values.push(value.join("."));
          break;
        case ObjectType.IpAddress:
          length = 4;
          value = addressRemaining.splice(0, length);
          values.push(value.join("."));
          break;
        case ObjectType.OctetString:
          if (indexPart.implied) {
            length = addressRemaining.length;
          } else {
            length = addressRemaining.shift();
          }
          value = addressRemaining.splice(0, length);
          value = value.map(c => String.fromCharCode(c)).join("");
          values.push(value);
          break;
        default:
          values.push(parseInt(addressRemaining.shift()));
      }
    }
    return values;
  }

  getTableRowInstanceFromRowIndex = ({tableIndex}, rowIndex) => {
    let rowIndexOid = [];
    for (let i = 0; i < tableIndex.length; i++) {
      let indexPart = tableIndex[i];
      let keyPart = rowIndex[i];
      rowIndexOid = rowIndexOid.concat(this.getOidAddressFromValue(keyPart, indexPart));
    }
    return rowIndexOid;
  }

  addTableRow = (table, row) => {
    let providerNode;
    let provider;
    let instance = [];
    let instanceAddress;
    let instanceNode;

    if (this.providers[table] && !this.providerNodes[table]) {
      this.addProviderToNode(this.providers[table]);
    }
    providerNode = this.getProviderNodeForTable(table);
    provider = providerNode.provider;
    let rowValueOffset = provider.tableIndex.filter(({foreign}) => foreign).length;
    instance = this.getTableRowInstanceFromRow(provider, row);
    for (let i = 0; i < provider.tableColumns.length; i++) {
      const column = provider.tableColumns[i];
      instanceAddress = providerNode.address.concat(column.number).concat(instance);
      this.addNodesForAddress(instanceAddress);
      instanceNode = this.lookup(instanceAddress);
      instanceNode.valueType = column.type;
      instanceNode.value = row[rowValueOffset + i];
    }
  }

  getTableColumnDefinitions = (table) => {
    let providerNode;
    let provider;

    providerNode = this.getProviderNodeForTable(table);
    provider = providerNode.provider;
    return provider.tableColumns;
  }

  getTableColumnCells = (table, columnNumber, includeInstances) => {
    const provider = this.providers[table];
    const providerIndex = provider.tableIndex;
    const providerNode = this.getProviderNodeForTable(table);
    const columnNode = providerNode.children[columnNumber];
    const instanceNodes = columnNode.getInstanceNodesForColumn();
    let instanceOid;
    const indexValues = [];
    const columnValues = [];

    for (const instanceNode of instanceNodes) {
      instanceOid = Mib.getSubOidFromBaseOid(instanceNode.oid, columnNode.oid);
      indexValues.push(this.getRowIndexFromOid(instanceOid, providerIndex));
      columnValues.push(instanceNode.value);
    }
    if (includeInstances) {
      return [indexValues, columnValues];
    } else {
      return columnValues;
    }
  }

  getTableRowCells = (table, rowIndex) => {
    let provider;
    let providerNode;
    let columnNode;
    let instanceAddress;
    let instanceNode;
    const row = [];

    provider = this.providers[table];
    providerNode = this.getProviderNodeForTable(table);
    instanceAddress = this.getTableRowInstanceFromRowIndex(provider, rowIndex);
    for (const columnNumber of Object.keys(providerNode.children)) {
      columnNode = providerNode.children[columnNumber];
      instanceNode = columnNode.getInstanceNodeForTableRowIndex(instanceAddress);
      row.push(instanceNode.value);
    }
    return row;
  }

  getTableCells = (table, byRows, includeInstances) => {
    let providerNode;
    let column;
    const data = [];

    providerNode = this.getProviderNodeForTable(table);
    for (const columnNumber of Object.keys(providerNode.children)) {
      column = this.getTableColumnCells(table, columnNumber, includeInstances);
      if (includeInstances) {
        data.push(...column);
        includeInstances = false;
      } else {
        data.push(column);
      }
    }

    if (byRows) {
      return Object.keys(data[0]).map(c => data.map(r => r[c]));
    } else {
      return data;
    }

  }

  getTableSingleCell = (table, columnNumber, rowIndex) => {
    let provider;
    let providerNode;
    let instanceAddress;
    let columnNode;
    let instanceNode;

    provider = this.providers[table];
    providerNode = this.getProviderNodeForTable(table);
    instanceAddress = this.getTableRowInstanceFromRowIndex(provider, rowIndex);
    columnNode = providerNode.children[columnNumber];
    instanceNode = columnNode.getInstanceNodeForTableRowIndex(instanceAddress);
    return instanceNode.value;
  }

  setTableSingleCell = (table, columnNumber, rowIndex, value) => {
    let provider;
    let providerNode;
    let columnNode;
    let instanceNode;

    provider = this.providers[table];
    providerNode = this.getProviderNodeForTable(table);
    let instanceAddress = this.getTableRowInstanceFromRowIndex(provider, rowIndex);
    columnNode = providerNode.children[columnNumber];
    instanceNode = columnNode.getInstanceNodeForTableRowIndex(instanceAddress);
    instanceNode.value = value;
  }

  deleteTableRow = (table, rowIndex) => {
    let provider;
    let providerNode;
    let instanceAddress;
    let columnNode;
    let instanceNode;

    provider = this.providers[table];
    providerNode = this.getProviderNodeForTable(table);
    instanceAddress = this.getTableRowInstanceFromRowIndex(provider, rowIndex);
    for (const columnNumber of Object.keys(providerNode.children)) {
      columnNode = providerNode.children[columnNumber];
      instanceNode = columnNode.getInstanceNodeForTableRowIndex(instanceAddress);
      if (instanceNode) {
        instanceNode.delete();
        instanceNode.parent.pruneUpwards();
      } else {
        throw new ReferenceError(`Cannot find row for index ${rowIndex} at registered provider ${table}`);
      }
    }
    return true;
  }

  dump(options) {
    if (!options) {
      options = {};
    }
    const completedOptions = {
      leavesOnly: options.leavesOnly || true,
      showProviders: options.leavesOnly || true,
      showValues: options.leavesOnly || true,
      showTypes: options.leavesOnly || true,
    };
    this.root.dump(completedOptions);
  }
}
