/* eslint-disable camelcase */
/* eslint-disable no-loop-func */
/* eslint-disable no-fallthrough */
/* eslint-disable new-cap */
import fs from "fs";
import {promisify} from "util";
import CharBuffer from "./char-buffer";
// import ASN1BER from "./asn1ber";

const readFileAsync = promisify(fs.readFile);

export default class MibParser {
  constructor() {
    this.SymbolBuffer = {};
    this.StringBuffer = "";
    this.Modules = {};
    this.Objects = {};
    this.MACROS = [];
    this.CurrentObject = null;
    this.TempObject = {};
    this.CurrentClause = "";
    this.WaitFor = "";
    this.CharBuffer = new CharBuffer();
  }

  import = async(filePath) => {
    // var filePath;
    // if (fileName.startsWith("/") || /^[a-zA-Z]:\\/.test(fileName)) {
    //   filePath = fileName;
    // } else {
    //   filePath = __dirname + "/" + fileName;
    // }
    const contents = await readFileAsync(filePath, {
      encoding: "utf-8",
    });

    //TODO why the splitting - will break in windows?
    return this.parseModule(filePath.split("/")[filePath.split("/").length - 1].split(".")[0], contents);
  }
  parseModule = (FileName, Contents) => {
    this.CharBuffer.RowIndex = 0;
    this.CharBuffer.ColumnIndex = 0;

    var lines = Contents.split("\n");
    var line = "";
    var i = 0;
    while ((line = lines[i]) !== null && i <= lines.length) {
      this.ParseLine(FileName, line, i);
      i++;
    }
  }
  ParseLine = (FileName, line = "", row) => {
    line = `${line}\n`;
    for (var i = 0; i < line.length; i++) {
      var char = line.charAt(i);
      this.ParseChar(FileName, char, row, i);
    }
  }
  ParseChar = (FileName, char, row, column) => {
    switch (char) {
      case "\r":
      case "\n":
        if (!this.CharBuffer.isString) {
          this.CharBuffer.fill(FileName, row, column);
          this.CharBuffer.isComment = false;
          this.CharBuffer.inGroup = 0; //IGNORE GROUPINGS ACROSS COMMENTS
        } else if (this.CharBuffer.isString && this.CharBuffer.isComment) {
          this.CharBuffer.append(char);
        }
        break;
      case "{":
        if (this.CharBuffer.isEqual) {
          this.CharBuffer.isOID = true;
        }
      case "[":
      case "(":
        this.CharBuffer.nested++;
        if (char === "(") {
          this.CharBuffer.inGroup++;
        }
        if (this.CharBuffer.isComment || ((this.CharBuffer.isOID || this.CharBuffer.nested > 0) && (!this.CharBuffer.isList || this.CharBuffer.inGroup > 0))) {
          this.CharBuffer.append(char);
        } else {
          this.CharBuffer.fill(FileName, row, column);
          this.CharBuffer.append(char);
          this.CharBuffer.fill(FileName, row, column);
        }
        break;
      case "}":
      case "]":
      case ")":
        this.CharBuffer.nested--;
        if (this.CharBuffer.nested <= 0) {
          this.CharBuffer.nested = 0;
        }
        if (char === ")") {
          this.CharBuffer.inGroup--;
          if (this.CharBuffer.inGroup < 0) {
            this.CharBuffer.inGroup = 0; //IGNORE GROUPINGS ACROSS COMMENTS
          }
        }
        if (this.CharBuffer.isComment || ((this.CharBuffer.isOID || this.CharBuffer.nested >= 0) && (!this.CharBuffer.isList || this.CharBuffer.inGroup >= 0))) {
          this.CharBuffer.append(char);
        } else {
          this.CharBuffer.fill(FileName, row, column);
          this.CharBuffer.append(char);
          this.CharBuffer.fill(FileName, row, column);
        }

        if (char === "}") {
          this.CharBuffer.isOID = false; this.CharBuffer.isList = false;
        }
        break;
      case ",":
        if (this.CharBuffer.isComment) {
          this.CharBuffer.append(char);
        } else {
          this.CharBuffer.fill(FileName, row, column);
          this.CharBuffer.append(char);
          this.CharBuffer.fill(FileName, row, column);
        }
        break;

      case ";":
        if (this.CharBuffer.isComment) {
          this.CharBuffer.append(char);
        } else {
          this.CharBuffer.fill(FileName, row, column);
          this.CharBuffer.append(char);
          this.CharBuffer.fill(FileName, row, column);
        }
        break;

      case " ":
        if (this.CharBuffer.isComment || ((this.CharBuffer.isOID || this.CharBuffer.nested > 0) && (!this.CharBuffer.isList || this.CharBuffer.inGroup > 0))) {
          this.CharBuffer.append(char);
        } else {
          this.CharBuffer.fill(FileName, row, column);
        }
        break;
      case "-":
        this.CharBuffer.append(char);
        if (this.CharBuffer.lastChar === "-") {
          this.CharBuffer.isComment = true;
          this.CharBuffer.builder = this.CharBuffer.builder.split("--")[0];
          this.CharBuffer.fill(FileName, row, column);
          this.CharBuffer.builder = "--";
        }

        break;
      case "\"":
        if (this.CharBuffer.isComment && !this.CharBuffer.isString && !this.CharBuffer.inComment) {
          //011 = COMMENT
          //IF 011 SET 101
          this.CharBuffer.isComment = true;
          this.CharBuffer.isString = false;
          this.CharBuffer.inComment = true;
        } else if (!this.CharBuffer.isComment && !this.CharBuffer.isString && !this.CharBuffer.inComment) {
          //000 = STRING
          //IF 000 SET 110
          this.CharBuffer.isComment = true;
          this.CharBuffer.isString = true;
          this.CharBuffer.inComment = false;
          this.CharBuffer.fill(FileName, row, column); //new string
        } else if (this.CharBuffer.isComment && this.CharBuffer.isString && !this.CharBuffer.inComment) {
          //110 = END STRING
          //IF 110 SET 000
          this.CharBuffer.isComment = false;
          this.CharBuffer.isString = false;
          this.CharBuffer.inComment = false;
        } else if (this.CharBuffer.isComment && !this.CharBuffer.isString && this.CharBuffer.inComment) {
          //101 = END COMMENT
          //IF 101 SET 000
          this.CharBuffer.isComment = true;
          this.CharBuffer.isString = false;
          this.CharBuffer.inComment = false;
        }

        if (this.CharBuffer.isComment) {
          this.CharBuffer.append(char);
        } else {
          this.CharBuffer.append(char);
          this.CharBuffer.fill(FileName, row, column);
        }
        break;

      default:
        this.CharBuffer.append(char);
        break;
    }
    this.CharBuffer.lastChar = char;
  }
  serialize = () => {
    var Table = this.CharBuffer.Table;
    var ModuleName = "";
    for (var FileName in Table) {
      ModuleName = this.CharBuffer.ModuleName[FileName];
      this.SymbolBuffer[ModuleName] = [];
      for (var r = 0; r < Table[FileName].length; r++) {
        for (var c = 0; c < Table[FileName][r].length; c++) {
          var symbol = Table[FileName][r][c];
          switch (symbol) {
            default:
              if (symbol.indexOf("--") !== 0) {//REMOVE COMMENTS
                //console.log(ModuleName, symbol);
                this.SymbolBuffer[ModuleName].push(symbol);
              }
          }
        }
      }

    }
    this.Compile();
  }
  Compile = () => {
    for (var ModuleName in this.SymbolBuffer) {
      if (this.SymbolBuffer.hasOwnProperty(ModuleName)) {
        if (!this.Modules[ModuleName]) {
          this.Modules[ModuleName] = {};
        }
        var Module = this.Modules[ModuleName];
        var Symbols = this.SymbolBuffer[ModuleName];
        var Object = Module;
        var MACROName = "";
        for (var i = 0; i < Symbols.length; i++) {
          switch (Symbols[i]) {
            case "::=": //new OBJECT to define
              //if OBJECT IDENTIFIER tag IS NEXT, FIND MARCO TO CALL...
              if (Symbols[i + 1].indexOf("{") === 0) {
                var r = i - 1;
                var found = false;
                //Go back and find the MACRO to call
                while (!found && r > 0) {
                  r--;
                  for (var m = 0; m < this.MACROS.length; m++) {
                    if (Symbols[r] === this.MACROS[m]) {
                      found = true;
                      break;
                    }
                  }
                }
                if (Symbols[i - 1] === "OBJECT IDENTIFIER") {
                  Object[Symbols[i - 2]] = {};
                  Object[Symbols[i - 2]].ObjectName = Symbols[i - 2];
                  Object[Symbols[i - 2]].ModuleName = ModuleName;
                  Object[Symbols[i - 2]]["OBJECT IDENTIFIER"] = Symbols[i + 1].replace("{", "").replace("}", "").trim();
                  if (Object[Symbols[i - 2]]["OBJECT IDENTIFIER"] === "0 0") {
                    Object[Symbols[i - 2]].OID = "0.0";
                    Object[Symbols[i - 2]].NameSpace = "null";
                  } else {
                    this.OID(Object[Symbols[i - 2]]["OBJECT IDENTIFIER"], "", Symbols[i - 2], "", function (ID, OD) {
                      Object[Symbols[i - 2]].OID = ID;
                      Object[Symbols[i - 2]].NameSpace = OD;
                      //Object[Symbols[i - 2]]['ModuleName'] = ModuleName;
                      // Object[Symbols[i - 2]]['ObjectName'] = Symbols[i - 2];
                    });
                  }

                } else {
                  var ObjectName = Symbols[r - 1];
                  Object[ObjectName] = {};
                  Object[ObjectName].ObjectName = ObjectName;
                  Object[ObjectName].ModuleName = ModuleName;
                  Object[ObjectName].MACRO = Symbols[r];
                  //BUILD OBJECT FROM MACRO TYPE NOTATION
                  var MARCO = this[Symbols[r]];
                  if (!MARCO) {
                    //HACK IF MARCO IS NOT FOUND
                    //MARCO = {};
                    //return;
                  }
                  var c1 = r;
                  var keychain = [];
                  keychain.push("DESCRIPTION");
                  for (var notation in MARCO["TYPE NOTATION"]) {
                    let key = notation;
                    //if TYPE NOTATION does not have a value
                    if (MARCO["TYPE NOTATION"][notation] === null) {
                      //then look up the value from the MACRO Root
                      key = MARCO[notation];
                    }
                    keychain.push(key);
                  }
                  while (c1 < (i - 1)) {
                    c1++;
                    let key = Symbols[c1]; //Parse TYPE NOTATION. ex: SYNTAX, ACCESS, STATUS, DESCRIPTION.....

                    //key === 'DESCRIPTION' ? console.log(keychain.indexOf(key), key, Symbols[c1 + 1]) : false;

                    var regExp = /\(([^)]+)\)/; //in parentheses ex: "ethernet-csmacd (6)"

                    if (keychain.indexOf(key) > -1) {
                      var val = Symbols[c1 + 1].replace(/"/g, "");
                      //if value array.
                      if (val.indexOf("{") === 0) {
                        c1++;
                        while (Symbols[c1].indexOf("}") === -1) {
                          c1++;
                          val += Symbols[c1];
                        }
                        //build value array.
                        val = val.replace("{", "").replace("}", "").split(",");
                      }

                      switch (key) {
                        case "SYNTAX":
                          switch (val) {
                            case "BITS":
                            case "INTEGER":
                              //integer value array ex: INTEGER {...rfc877-x25 (5), ethernet-csmacd (6)...}
                              if (Symbols[c1 + 2].indexOf("{") === 0) {
                                var valObj = val;
                                val = {};
                                val[valObj] = {};
                                c1 = c1 + 1;
                                var integer;
                                var syntax;
                                //console.log(ModuleName, ObjectName);
                                while (Symbols[c1].indexOf("}") === -1) {
                                  c1++;
                                  var ok = false;
                                  if (Symbols[c1].indexOf("(") === 0 && Symbols[c1].length > 1) {
                                    integer = regExp.exec(Symbols[c1]);
                                    syntax = Symbols[c1 - 1];
                                    ok = true;
                                  } else if (Symbols[c1].indexOf("(") > 0) {
                                    integer = regExp.exec(Symbols[c1]);
                                    syntax = Symbols[c1].split("(")[0];
                                    ok = true;
                                  }
                                  if (syntax && syntax.indexOf("{") === 0) {
                                    syntax = syntax.split("{")[1].trim();
                                  }
                                  if (ok) {
                                    val[valObj][integer[1]] = syntax;
                                    //console.log(ModuleName, ObjectName, integer[1], syntax);
                                  }
                                }

                              }
                              break;
                            case "SEQUENCE OF":
                              val += " " + Symbols[c1 + 2];
                              c1 = c1 + 2;
                              break;
                            default:
                              break;
                          }
                          //SYNTAX value
                          Object[ObjectName][key] = val;
                          break;
                          //case 'DESCRIPTION':
                          //remove description
                          //   break;
                        default:
                          Object[ObjectName][key] = val;
                          break;
                      }
                    }


                  }
                  Object[Symbols[r - 1]].ObjectName = Symbols[r - 1];
                  Object[Symbols[r - 1]].ModuleName = ModuleName;
                  Object[Symbols[r - 1]]["OBJECT IDENTIFIER"] = Symbols[i + 1].replace("{", "").replace("}", "").trim();

                  if (Object[Symbols[r - 1]]["OBJECT IDENTIFIER"] === "0 0") {
                    Object[Symbols[r - 1]].OID = "0.0";
                    Object[Symbols[r - 1]].NameSpace = "null";
                  } else {
                    this.OID(Object[Symbols[r - 1]]["OBJECT IDENTIFIER"], "", Symbols[r - 1], "", function (ID, OD) {

                      Object[Symbols[r - 1]].OID = ID;
                      Object[Symbols[r - 1]].NameSpace = OD;
                      //Object[Symbols[r - 1]]['ModuleName'] = ModuleName;
                      //Object[Symbols[r - 1]]['ObjectName'] = Symbols[r - 1];
                    });
                  }

                }
              } else {
                //if OBJECT IDENTIFIER tag is NOT NEXT, check prior symbol for processing instructions / MARCO creation.
                switch (Symbols[i - 1]) {
                  case "DEFINITIONS":
                    break;
                  case "OBJECT IDENTIFIER":
                    break;
                  case "MACRO":
                    Object = Object[Symbols[i - 2]] = {};
                    MACROName = Symbols[i - 2];
                    break;
                  case "VALUE NOTATION":
                  case "TYPE NOTATION":
                    Object[Symbols[i - 1]] = {};
                    let r = i + 1;
                    while (Symbols[r + 1] !== "::=" && Symbols[r + 1] !== "END") {
                      if (Symbols[r].indexOf("\"") === 0) {
                        let val = Symbols[r + 1];
                        var t = r + 1;
                        if (Symbols[r + 2].indexOf("(") === 0) {
                          val = Symbols[r + 2];
                          t = r + 2;
                        }
                        Object[Symbols[i - 1]][Symbols[r].replace(/"/g, "")] = val;
                        r = t;
                      } else {
                        Object[Symbols[i - 1]][Symbols[r]] = null;
                        if (Symbols[r + 1].indexOf("(") === 0) {
                          Object[Symbols[i - 1]][Symbols[r]] = Symbols[r + 1];
                          r++;
                        }
                      }
                      r++;
                    }
                    // Workaround for lack of INDEX and AUGMENTS in OBJECT-TYPE MACRO "TYPE NOTATION"
                    if (ModuleName === "SNMPv2-SMI") {
                      Object["TYPE NOTATION"].INDEX = "Index";
                      Object["TYPE NOTATION"].AUGMENTS = "Augments";
                    } else if (ModuleName === "RFC-1212") {
                      Object["TYPE NOTATION"].INDEX = "Index";
                    }
                    // End INDEX/AUGMENTS workaround
                    break;
                  default:
                    //new object
                    Object[Symbols[i - 1]] = {};
                    Object[Symbols[i - 1]].ObjectName = Symbols[i - 1];
                    Object[Symbols[i - 1]].ModuleName = ModuleName;
                    Object[Symbols[i - 1]].MACRO = Symbols[i + 1];
                    this.BuildObject(Object, Symbols[i - 1], Symbols[i + 1], i, Symbols);
                    break;
                }
              }
              break;
            case "END":
              if (MACROName !== "") {
                //ADD macros to root for easier processing
                //Still need Import feature
                this[MACROName] = Object;
                this.MACROS.push(MACROName);
              }
              //reset Object to Module root;
              Object = Module;
              MACROName = "";
              break;
            case "IMPORTS":
              //console.log(ModuleName, 'IMPORTS');
              //i++;
              Module.IMPORTS = {};
              var tmp = i + 1;
              var IMPORTS = [];
              while (Symbols[tmp] !== ";") {
                if (Symbols[tmp] === "FROM") {
                  var ImportModule = Symbols[tmp + 1];
                  if (!this.Modules[ImportModule]) {
                    console.log(ModuleName + ": Can not find " + ImportModule + "!!!!!!!!!!!!!!!!!!!!!");
                    console.log(ModuleName + ": Can not import ", IMPORTS);
                  }
                  Module.IMPORTS[ImportModule] = IMPORTS;
                  tmp++;
                  IMPORTS = [];
                } else if (Symbols[tmp] !== ",") {
                  IMPORTS.push(Symbols[tmp]);
                }
                tmp++;
              }
              //console.log(ModuleName, 'IMPORTS', Module['IMPORTS']);
              break;
            case "EXPORTS":
              //console.log(ModuleName, 'EXPORTS');
              break;
            default:
              break;
          }


        }
      }
    }
  }
  BuildObject = (Object, ObjectName, macro, i, Symbols) => {

    var r = i;
    var found = false;
    var m = Symbols.indexOf("SYNTAX", r) - r;
    var SYNTAX = Symbols[Symbols.indexOf("SYNTAX", r) + 1];
    var val = Symbols[Symbols.indexOf("SYNTAX", r) + 2];
    var c1 = Symbols.indexOf("SYNTAX", r) + 1;



    if (this.MACROS.indexOf(macro) > -1 && m < 10) {
      switch (SYNTAX) {
        case "INTEGER":
          if (val.indexOf("{") === 0) {
            c1++;
            while (Symbols[c1].indexOf("}") === -1) {
              c1++;
              val += Symbols[c1].trim();
            }
            val = val.replace("{", "").replace("}", "").split(",");

            Object[ObjectName].SYNTAX = {};
            Object[ObjectName].SYNTAX[SYNTAX] = {};

            for (var TC = 0; TC < val.length; TC++) {
              Object[ObjectName].SYNTAX[SYNTAX][val[TC].split("(")[1].replace(")", "")] = val[TC].split("(")[0];
            }
          }
          break;
        default:
          Object[ObjectName].SYNTAX = SYNTAX;
          break;

      }
    }



  }
  GetSummary = (callback) => {
    var summary = "";
    for (var ModuleName in this.Modules) {
      if (this.Modules.hasOwnProperty(ModuleName)) {
        for (var ObjectName in this.Modules[ModuleName]) {
          if (this.Modules[ModuleName].hasOwnProperty(ObjectName)) {
            if (this.Modules[ModuleName][ObjectName].OID) {
              //OID
              summary += this.Modules[ModuleName][ObjectName].OID + " : " + ObjectName + "\r\n";
              //callback(this.Modules[ModuleName][ObjectName]);
              //break;
            }
          }
        }
      }
    }
    callback(summary);
  }
  // GetObject__ = (string, callback) => {
  //   var found = false;
  //   var MatchLength = 0;
  //   var MatchObject = {};
  //   if (typeof string === "string" && string.indexOf(".") > -1) {
  //     var stringtype = "NameSpace";
  //     if (parseInt(string.split(".")[1]) || string === "0.0") {
  //       stringtype = "OID";
  //     }

  //     for (let ModuleName in this.Modules) {
  //       if (this.Modules.hasOwnProperty(ModuleName) && !found) {
  //         for (var ObjectName in this.Modules[ModuleName]) {
  //           if (this.Modules[ModuleName].hasOwnProperty(ObjectName) && !found) {
  //             if (this.Modules[ModuleName][ObjectName][stringtype] === string && !found) {
  //               found = true;
  //               callback(this.Modules[ModuleName][ObjectName]);
  //               break;
  //             }
  //             if (string.indexOf(this.Modules[ModuleName][ObjectName][stringtype]) > -1 && !found) {
  //               var length = this.Modules[ModuleName][ObjectName][stringtype].split(".").length;
  //               if (length >= MatchLength) {
  //                 MatchLength = length;
  //                 MatchObject = this.Modules[ModuleName][ObjectName];
  //               }
  //             }
  //           }
  //         }
  //       }
  //     }
  //   } else {

  //     for (let ModuleName in this.Modules) {
  //       if (this.Modules.hasOwnProperty(ModuleName)) {
  //         if (this.Modules[ModuleName][string]) {
  //           found = true;
  //           callback(this.Modules[ModuleName][string]);
  //           //string === ObjectName
  //           break;
  //         }
  //       }
  //     }
  //   }
  //   if (!found) {
  //     callback(MatchObject);
  //   }
  // }
  getObject = (objId) => {
    let found = false;
    let MatchLength = 0;
    let MatchObject = {};
    let modulesKeys = Object.keys(this.Modules);
    if (typeof objId === "string" && objId.indexOf(".") > -1) {
      let stringType = "NameSpace";
      if (parseInt(objId.split(".")[1]) || objId === "0.0") {
        stringType = "OID";
      }
      for (let m = modulesKeys.length - 1; m >= 0; m--) {// search newset moduels first
        var module = this.Modules[modulesKeys[m]];
        var Objects = Object.keys(module);

        for (let o = 0; o < Objects.length; o++) {
          var MOD_Object = this.Modules[modulesKeys[m]][Objects[o]];
          if (MOD_Object[stringType] === objId && !found) {
            found = true;
            return MOD_Object;
          }
          if (objId.indexOf(MOD_Object[stringType]) > -1 && !found) {
            var length = MOD_Object[stringType].split(".").length;
            if (length >= MatchLength) {
              MatchLength = length;
              MatchObject = MOD_Object;
            }
          }
        }
      }
    } else {
      for (let m = modulesKeys.length - 1; m >= 0; m--) {// search newset moduels first
        if (this.Modules[modulesKeys[m]][objId]) {
          found = true;
          return this.Modules[modulesKeys[m]][objId];
        }
      }

    }
    if (!found) {
      return MatchObject;
    }
    return undefined;
  }
OID = (OBJECT_IDENTIFIER, ID, ObjectName, OD, callback) => {
  let members = OBJECT_IDENTIFIER.split(" ");
  let parent = members.shift();
  let oid = members.pop();
  if (parent === "iso") {
    let midID = ["1"];
    let midOD = ["iso"];
    for (let entry of members) {
      let match = entry.match(/(.*)\((.+)\)$/);
      midID.push(match[2]);
      midOD.push(match[1]);
    }
    midID.push(oid);
    midID.push(ID);
    midOD.push(OD);
    midOD.push(ObjectName);
    callback(midID.join("."), midOD.join("."));
    return;
  }
  ID = ID === "" ? oid : [oid, ID].join(".");
  OD = OD === "" ? parent : [parent, OD].join(".");
  for (var ModuleName in this.Modules) {
    if (this.Modules.hasOwnProperty(ModuleName)) {
      if (this.Modules[ModuleName][parent]) {
        this.OID(this.Modules[ModuleName][parent]["OBJECT IDENTIFIER"], ID, ObjectName, OD, callback);
        break;
      }
    }
  }
}
LoadMIBs = () => {
  console.log("Loading modules...");

  this.Import("./RFC_BASE_MINIMUM//RFC1155-SMI.MIB");
  this.Import("./RFC_BASE_MINIMUM//RFC1158-MIB.MIB");
  this.Import("./RFC_BASE_MINIMUM//RFC-1212.mib");
  this.Import("./RFC_BASE_MINIMUM//RFC1213-MIB-II.MIB");
  this.Import("./RFC_BASE_MINIMUM//SNMPv2-SMI.mib");
  this.Import("./RFC_BASE_MINIMUM//SNMPv2-CONF.mib");
  this.Import("./RFC_BASE_MINIMUM//SNMPv2-TC.mib");
  this.Import("./RFC_BASE_MINIMUM//SNMPv2-MIB.mib");

  this.Import("./RFC_BASE_MINIMUM//ianaiftype-mib.MIB");
  this.Import("./RFC_BASE_MINIMUM//IF-MIB.MIB");
  this.Import("./RFC_BASE_MINIMUM//IP-FORWARD-MIB.MIB");
  //trap types
  this.Import("./RFC_BASE_MINIMUM//RFC-1215.MIB");
  //vlan port assingment

  this.Import("./RFC_BASE_MINIMUM//BRIDGE-MIB.MIB");



  this.Import("./RFC_BASE_MINIMUM//BGP4-MIB.MIB");

  this.Import("./RFC_BASE_MINIMUM//HOST-RESOURCES-MIB.MIB");

  this.Import("./RFC_BASE_MINIMUM//CISCO-SMI.MIB");
  this.Import("./RFC_BASE_MINIMUM//CISCO-TC.MIB");
  this.Import("./RFC_BASE_MINIMUM//CISCO-PRODUCTS-MIB.MIB");

  this.Import("./RFC_BASE_MINIMUM//OLD-CISCO-TCP-MIB.MIB");
  this.Import("./RFC_BASE_MINIMUM//OLD-CISCO-TS-MIB.MIB");

  this.Import("./RFC_BASE_MINIMUM//RMON-MIB.MIB");
  this.Import("./RFC_BASE_MINIMUM//INET-ADDRESS-MIB.mib");
  this.Import("./RFC_BASE_MINIMUM//IP-MIB.MIB");

  this.Import("./RFC_BASE_MINIMUM//SNMP-FRAMEWORK-MIB.mib");

  this.Import("./RFC_BASE_MINIMUM//ENTITY-MIB.MIB");



  this.Import("./RFC_BASE_MINIMUM//CISCO-VTP-MIB.MIB");


  this.Import("./RFC_BASE_MINIMUM//CISCO-CDP-MIB.MIB");
  this.Import("./RFC_BASE_MINIMUM//CISCO-VLAN-MEMBERSHIP-MIB.MIB");
  this.Import("./RFC_BASE_MINIMUM//CISCO-METRO-PHY-MIB.MIB");
  //TRAPS
  this.Import("./RFC_BASE_MINIMUM//CISCO-CONFIG-MAN-MIB.MIB");
  this.Import("./RFC_BASE_MINIMUM//CISCO-SYSLOG-MIB.MIB");
  this.Import("./RFC_BASE_MINIMUM//CISCO-IPSEC-FLOW-MONITOR-MIB.mib");
  this.Import("./RFC_BASE_MINIMUM//CISCO-IPSEC-MIB.MIB");
  this.Import("./RFC_BASE_MINIMUM//CISCO-EIGRP-MIB.MIB");
  this.Import("./RFC_BASE_MINIMUM//CISCO-ENTITY-SENSOR-MIB.MIB");

  console.log("Compiling modules...");
  this.Serialize();

}
WriteToFile = () => {
  fs.writeFile(__dirname + "/mib.JSON", JSON.stringify(this.Modules, null, 4), function (err) {
    if (err) {
      console.log(err);
    } else {
      console.log("The file was saved!");
    }
  });
}
ReadFromFile = () => {
  fs.readFile(__dirname + "/mib.JSON", "utf8", function (err, data) {
    if (err) {
      console.log(err);
    } else {
      this.Modules = JSON.parse(data);
      console.log("The file was read!");
    }
  });
}
ParseVarBind__ = (varbind, callback) => {
  var self = this;
  var snmpjsVarBind =
    {oid: "1.3.6.1.2.1.1.3.0",
      typename: "TimeTicks",
      value: 208265883,
      string_value: "208265883",
    };
  var snmpnativeVarBind =
    {oid: [1, 3, 6, 1, 2, 1, 1, 3, 0],
      //typename: 'TimeTicks',
      type: 67,
      value: 208265883,
      valueRaw: "<Buffer 53 50 36 35 30 30 2d 31 2e 53 48 49 >",
      valueHex: "5350363530302d312e534849",
    };

  this.GetObject(varbind.oid, function (err, Object) {
    if (Object.SYNTAX) {
      var response = {Object: Object, syntaxValue: varbind.value, OIDresidue: varbind.oid.replace(Object.OID + ".", "")};

      switch (varbind.typename) {
        case "Integer":
          if (Object.SYNTAX && Object.SYNTAX.INTEGER) {
            response.syntaxValue = Object.SYNTAX.INTEGER[varbind.value];
          } else {
            self.GetObject(Object.SYNTAX, function (err, Object1) {
              if (Object1.SYNTAX && Object1.SYNTAX.INTEGER) {
                response.syntaxValue = Object1.SYNTAX.INTEGER[varbind.value];
              } else {
                response.syntaxValue = varbind.value;
              }
            });
          }
          break;
        case "ObjectIdentifier":
          self.GetObject(varbind.value, function (err, Object1) {
            response.syntaxValue = Object1.ObjectName;
          });
          break;
        case "OctetString":
          if (Object.SYNTAX === "OCTET STRING" || Object.SYNTAX.indexOf("ddr") > -1) {
            var buffstring = "";
            var delimiter = ".";
            var buf = varbind.value;
            for (let ii = 0; ii < buf.length; ii++) {
              if (ii === buf.length - 1) {
                delimiter = "";
              }
              buffstring += buf.readUInt8(ii) + delimiter;
            }
            response.syntaxValue = buffstring;
          } else {
            response.syntaxValue = varbind.string_value;
          }
          break;
        default:
          break;
      }
      callback(response);
    }
  });
}
DecodeVarBinds = (varbinds, callback) => {
  var self = this;
  var VarBinds = [];
  if (!varbinds || !varbinds[0]) {
    callback(VarBinds); return;
  }
  var lib = Array.isArray(varbinds[0].oid) ? "snmp-native" : "snmpjs";

  var cached = {};
  cached.OID = "";
  cached.oid = "";
  cached.Object = {};
  cached.Object1 = {};

  var Vs = Object.keys(varbinds), V_len = Vs.length;
  for (let v = 0; v < V_len; v++) {
    let vb = varbinds[Vs[v]];
    vb.OID = vb.oid.toString().replace(/,/g, ".");
    vb.typename = (lib === "snmp-native") ? self.ASN1BER[vb.type] : vb.typename;
    var IsCache = vb.OID.replace(cached.OID + ".", "").split(".").length === cached.oid.split(".").length;
    var varbind = {NameSpace: "", OID: "", oid: "", ObjectName: "", TYPE: "", SYNTAX: "", Value: ""};

    if (IsCache) {
      varbind.NameSpace = cached.Object.NameSpace;
      varbind.OID = cached.Object.OID;
      varbind.oid = vb.OID.replace(cached.Object.OID + ".", "");

      cached.OID = varbind.OID;
      cached.oid = varbind.oid;

      varbind.ObjectName = cached.Object.ObjectName;
      varbind.TYPE = vb.typename;
      varbind.SYNTAX = cached.Object.SYNTAX;
      varbind.Value = vb.value;

      self.GetVarBindVal(vb, varbind, cached.Object, cached.Object1, lib);
      VarBinds.push(varbind);

    } else {
      self.GetObject(vb.OID, function (err, Object) {
        varbind.NameSpace = Object.NameSpace;
        varbind.OID = Object.OID;

        varbind.oid = vb.OID.replace(Object.OID + ".", "");
        cached.OID = varbind.OID;
        cached.oid = varbind.oid;

        varbind.ObjectName = Object.ObjectName;
        varbind.TYPE = vb.typename;
        varbind.SYNTAX = Object.SYNTAX;
        varbind.Value = vb.value;


        self.GetObject(Object.SYNTAX, function (err, Object1) {
          cached.Object = Object;
          cached.Object1 = Object1;
          self.GetVarBindVal(vb, varbind, Object, Object1, lib);
          VarBinds.push(varbind);
        });
      });
    }
  }


  callback(VarBinds);
}
GetVarBindVal = (vb, varbind, Object, Object1, lib) => {
  var self = this;
  if (!vb.value) {
    return;
  }
  switch (vb.typename) {
    case "Integer":
      if (Object.SYNTAX && Object.SYNTAX.INTEGER) {
        varbind.Value = Object.SYNTAX.INTEGER[vb.value];
      } else if (Object1.SYNTAX && Object1.SYNTAX.INTEGER) {
        varbind.Value = Object1.SYNTAX.INTEGER[vb.value];
      }
      break;
    case "NsapAddress":
    case "IpAddress":
    case "OctetString":
      if (typeof Object.SYNTAX === "string" && (Object.SYNTAX === "OCTET STRING" || Object.SYNTAX.indexOf("ddr") > -1 || Object.SYNTAX === "DateAndTime")) {
        var buffstring = "";
        var delimiter = ".";
        var buf = (lib === "snmp-native") ? vb.valueRaw : vb.value;
        var DT = (Object.SYNTAX === "DateAndTime");
        var Physical = (Object.SYNTAX.indexOf("PhysAddress") > -1 || Object.SYNTAX.indexOf("MacAddress") > -1);
        if (Physical) {
          varbind.Value = vb.valueHex;
          break;
        }
        for (let ii = 0; ii < buf.length; ii++) {
          if (ii === buf.length - 1) {
            delimiter = "";
          }

          if (DT && ii === 0) {
            delimiter = "-";
            buffstring += buf.readUInt16BE(ii) + delimiter;
            ii++;
          } else if (DT) {
            switch (ii) {
              case 3:
                delimiter = ",";
                break;
              case 4:
                delimiter = ":";
                break;
              case 6:
                delimiter = ".";
                break;
              case 7:
                delimiter = ",";
              case 8:
                delimiter = ":";
                break;
              default:
                break;
            }
            buffstring += buf.readUInt8(ii) + delimiter;
          } else {
            buffstring += buf.readUInt8(ii) + delimiter;
          }
        }
        varbind.Value = buffstring;
      } else {
        varbind.Value = vb.value;
      }
      break;
    case "Null":
    case "ObjectIdentifier":
      self.GetObject(vb.value.toString().replace(/,/g, "."), function (err, Object1) {

        varbind.Value = Object1.ObjectName;
      });
      break;
    case "Sequence":

    case "Counter":
    case "Gauge":
    case "TimeTicks":
    case "Opaque":

    case "Counter64":
    case "NoSuchObject":
    case "NoSuchInstance":
    case "EndOfMibView":
    case "PDUBase":
    default:
      break;
  }
}
delimiter2bracket = (json, delimiter) => {
  var bracket = {}, t, parts, part;
  for (var k in json) {
    t = bracket;
    parts = k.split(delimiter);

    var key = parts.pop(); //last part

    while (parts.length) {
      part = parts.shift(); //first part
      t = t[part] = t[part] || {};
    }
    t[key] = json[k]; //set value
  }
  return bracket;
}
MakeMibTree = () => {
  var NameSpace = {};
  for (var Module in this.Modules) {
    if (this.Modules.hasOwnProperty(Module)) {
      for (var Object in this.Modules[Module]) {
        if (this.Modules[Module].hasOwnProperty(Object)) {
          if (this.Modules[Module][Object].NameSpace) {
            var MIBobject = this.Modules[Module][Object];
            if (!NameSpace[MIBobject.NameSpace]) {
              NameSpace[MIBobject.NameSpace] = {};
            }
            //NameSpace[MIBobject.NameSpace]['OID'] = MIBobject.OID;
          }
        }
      }
    }
  }

  this.NameSpaceTable = this.delimiter2bracket(NameSpace, ".");
  //callback(NameSpaceTable);
}
}
