import MibParser from "./mib/parser";
import ObjectType from "./mib/object-type";
import {MibProviderType} from "./mib";
import path from "path";

export default class ModuleStore {
  constructor() {
    this.parser = new MibParser();
  }
  static BASE_MODULES = [
    "RFC1155-SMI",
    "RFC1158-MIB",
    "RFC-1212",
    "RFC1213-MIB",
    "SNMPv2-SMI",
    "SNMPv2-CONF",
    "SNMPv2-TC",
    "SNMPv2-MIB",
  ];
  static create = async() => {
    const store = new ModuleStore();
    await store.loadBaseModules();
    return store;
  };

  getSyntaxTypes() {
    const syntaxTypes = Object.assign({}, ObjectType);
    let entryArray;

    // var mibModule = this.parser.Modules[moduleName];
    for (const mibModule of Object.values(this.parser.Modules)) {
      entryArray = Object.values(mibModule);
      for (let mibEntry of entryArray) {
        if (mibEntry.MACRO === "TEXTUAL-CONVENTION") {
          if (mibEntry.SYNTAX && !syntaxTypes[mibEntry.ObjectName]) {
            if (typeof mibEntry.SYNTAX === "object") {
              syntaxTypes[mibEntry.ObjectName] = syntaxTypes.Integer;
            } else {
              syntaxTypes[mibEntry.ObjectName] = syntaxTypes[mibEntry.SYNTAX];
            }
          }
        }
      }
    }
    return syntaxTypes;
  }

  loadFromFile = async(fileName) => {
    await this.parser.import(fileName);
    return this.parser.serialize();
  }

  getModule = (moduleName) => {
    return this.parser.Modules[moduleName];
  }

  getModules = (includeBase) => {
    const modules = {};
    for (const moduleName of Object.keys(this.parser.Modules)) {
      if (includeBase || !ModuleStore.BASE_MODULES.includes(moduleName)) {
        modules[moduleName] = this.parser.Modules[moduleName];
      }
    }
    return modules;
  }

  getModuleNames = (includeBase) => {
    const modules = [];
    for (const moduleName of Object.keys(this.parser.Modules)) {
      if (includeBase || !ModuleStore.BASE_MODULES.includes(moduleName)) {
        modules.push(moduleName);
      }
    }
    return modules;
  }

  getProvidersForModule = (moduleName) => {
    const mibModule = this.parser.Modules[moduleName];
    const scalars = [];
    const tables = [];
    let syntaxTypes;

    if (!mibModule) {
      throw new ReferenceError(`MIB module ${moduleName} not loaded`);
    }
    syntaxTypes = this.getSyntaxTypes();
    let entryArray = Object.values(mibModule);
    for (let i = 0; i < entryArray.length; i++) {
      let mibEntry = entryArray[i];
      let syntax = mibEntry.SYNTAX;

      if (syntax) {
        if (typeof syntax === "object") {
          syntax = "INTEGER";
        }
        if (syntax.startsWith("SEQUENCE OF")) {
          // start of table
          let currentTableProvider = {
            tableName: mibEntry.ObjectName,
            type: MibProviderType.Table,
            //oid: mibEntry.OID,
            tableColumns: [],
            tableIndex: [1], // default - assume first column is index
          };
          // read table to completion
          while (currentTableProvider || i >= entryArray.length) {
            i++;
            mibEntry = entryArray[i];
            if (!mibEntry) {
              break;
            }
            syntax = mibEntry.SYNTAX;

            if (typeof syntax === "object") {
              syntax = "INTEGER";
            }

            if (mibEntry.MACRO === "SEQUENCE") {
              // table entry sequence - ignore
            } else if (!mibEntry["OBJECT IDENTIFIER"]) {
              // unexpected
            } else {
              let parentOid = mibEntry["OBJECT IDENTIFIER"].split(" ")[0];
              if (parentOid === currentTableProvider.tableName) {
                // table entry
                currentTableProvider.name = mibEntry.ObjectName;
                currentTableProvider.oid = mibEntry.OID;
                if (mibEntry.INDEX) {
                  currentTableProvider.tableIndex = [];
                  for (let indexEntry of mibEntry.INDEX) {
                    indexEntry = indexEntry.trim();
                    if (indexEntry.includes(" ")) {
                      if (indexEntry.split(" ")[0] === "IMPLIED") {
                        currentTableProvider.tableIndex.push({
                          columnName: indexEntry.split(" ")[1],
                          implied: true,
                        });
                      } else {
                        // unknown condition - guess that last token is name
                        currentTableProvider.tableIndex.push({
                          columnName: indexEntry.split(" ").slice(-1)[0],
                        });
                      }
                    } else {
                      currentTableProvider.tableIndex.push({
                        columnName: indexEntry,
                      });
                    }
                  }
                }
                if (mibEntry.AUGMENTS) {
                  currentTableProvider.tableAugments = mibEntry.AUGMENTS[0].trim();
                  currentTableProvider.tableIndex = null;
                }
              } else if (parentOid === currentTableProvider.name) {
                // table column
                currentTableProvider.tableColumns.push({
                  number: parseInt(mibEntry["OBJECT IDENTIFIER"].split(" ")[1]),
                  name: mibEntry.ObjectName,
                  type: syntaxTypes[syntax],
                });
              } else {
                // table finished
                tables.push(currentTableProvider);
                // console.log ("Table: " + currentTableProvider.name);
                currentTableProvider = null;
                i--;
              }
            }
          }
        } else if (mibEntry.MACRO === "OBJECT-TYPE") {
          // OBJECT-TYPE entries not in a table are scalars
          scalars.push({
            name: mibEntry.ObjectName,
            type: MibProviderType.Scalar,
            oid: mibEntry.OID,
            scalarType: syntaxTypes[syntax],
          });
          // console.log ("Scalar: " + mibEntry.ObjectName);
        }
      }
    }
    return scalars.concat(tables);
  }

  loadBaseModules = async() => {
    for (const mibModule of ModuleStore.BASE_MODULES) {
      await this.parser.import(path.resolve(__dirname, `../mibs/${mibModule}.mib`));
    }
    return this.parser.serialize();
  }
}
