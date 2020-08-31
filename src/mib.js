/* eslint-disable no-fallthrough */
import fs from "fs";
import path from "path";
import {promisify} from "util";

const readFileAsync = promisify(fs.readFile);

export const ASN1BER = {
  2: "Integer",
  4: "OctetString",
  5: "Null",
  6: "ObjectIdentifier",
  48: "Sequence",
  64: "IpAddress",
  65: "Counter",
  66: "Gauge",
  67: "TimeTicks",
  68: "Opaque",
  69: "NsapAddress",
  70: "Counter64",
  128: "NoSuchObject",
  129: "NoSuchInstance",
  130: "EndOfMibView",
  160: "PDUBase",
  Integer: 2,
  OctetString: 4,
  Null: 5,
  ObjectIdentifier: 6,
  Sequence: 48,
  IpAddress: 64,
  Counter: 65,
  Gauge: 66,
  TimeTicks: 67,
  Opaque: 68,
  NsapAddress: 69,
  Counter64: 70,
  NoSuchObject: 128,
  NoSuchInstance: 129,
  EndOfMibView: 130,
  PDUBase: 160,
};



export default class MIB {
  constructor(dir) {
    this.directory = dir;
    this.logit = false;
    this.lastChar = "";
    this.state = "";
    this.open = false;
    this.currentSymbol = "";
    this.nested = 0;
    this.isComment = false;
    this.isEqual = false;
    this.isOID = false;
    this.isList = false;
    this.isString = false;
    this.inComment = false;
    this.inGroup = 0;
    this.builder = "";
    this.table = {};
    this.columnIndex = 0;
    this.towIndex = 0;
    this.moduleName = {};
    this.previousRow = 0;
    this.symbolBuffer = {};
    this.stringBuffer = "";
    this.modules = {};
    this.objects = {};
    this.macros = [];
    this.currentObject = null;
    this.tempObject = {};
    this.currentClause = "";
    this.waitFor = "";
  }
  import = async(fileName) => {
    var filePath;
    if (fileName.startsWith("/") || /^[a-zA-Z]:\\/.test(fileName)) {
      filePath = fileName;
    } else {
      filePath = path.resolve(__dirname, fileName);
    }
    const contents = await readFileAsync(filePath, {
      encoding: "utf-8",
    });
    return this.parseModule(path.basename(fileName, path.extname(fileName)), contents);
  }
  parseModule = (moduleName, contents) => {
    this.rowIndex = 0;
    this.columnIndex = 0;
    contents.split("\n").filter((l) => l !== null).forEach((line, row) => {
      return this.parseLine(moduleName, line, row);
    });
  }
  parseLine = (moduleName, line, row) => {
    for (var column = 0; column < line.length; column++) {
      const char = `${line}\n`.charAt(column);
      this.parseChar(moduleName, char, row, column);
    }
  }

  parseChar = (moduleName, char, row, column) => {
    switch (char) {
      case "\r":
      case "\n":
        if (!this.isString) {
          this.fillCharBuffer(moduleName, row, column);
          this.isComment = false;
          this.inGroup = 0; //IGNORE GROUPINGS ACROSS COMMENTS
        } else if (this.isString && this.isComment) {
          this.append(char);
        }
        break;
      case "{":
        if (this.isEqual) {
          this.isOID = true;
        }
      case "[":
      case "(":
        this.nested++;
        if (char === "(") {
          this.inGroup++;
        }
        if (this.isComment || ((this.isOID || this.nested > 0) && (!this.isList || this.inGroup > 0))) {
          this.append(char);
        } else {
          this.fillCharBuffer(moduleName, row, column);
          this.append(char);
          this.fillCharBuffer(moduleName, row, column);
        }
        break;
      case "}":
      case "]":
      case ")":
        this.nested--;
        if (this.nested <= 0) {
          this.nested = 0;
        }
        if (char === ")") {
          this.inGroup--;
          if (this.inGroup < 0) {
            this.inGroup = 0; //IGNORE GROUPINGS ACROSS COMMENTS
          }
        }
        if (this.isComment || ((this.isOID || this.nested >= 0) && (!this.isList || this.inGroup >= 0))) {
          this.append(char);
        } else {
          this.fillCharBuffer(moduleName, row, column);
          this.append(char);
          this.fillCharBuffer(moduleName, row, column);
        }

        if (char === "}") {
          this.isOID = false;
          this.isList = false;
        }
        break;
      case ",":
        if (this.isComment) {
          this.append(char);
        } else {
          this.fillCharBuffer(moduleName, row, column);
          this.append(char);
          this.fillCharBuffer(moduleName, row, column);
        }
        break;

      case ";":
        if (this.isComment) {
          this.append(char);
        } else {
          this.fillCharBuffer(moduleName, row, column);
          this.append(char);
          this.fillCharBuffer(moduleName, row, column);
        }
        break;

      case " ":
        if (this.isComment || ((this.isOID || this.nested > 0) && (!this.isList || this.inGroup > 0))) {
          this.append(char);
        } else {
          this.fillCharBuffer(moduleName, row, column);
        }
        break;
      case "-":
        this.append(char);
        if (this.lastChar === "-") {
          this.isComment = true;
          this.builder = this.builder.split("--")[0];
          this.fillCharBuffer(moduleName, row, column);
          this.builder = "--";
        }

        break;
      case "\"":
        if (this.isComment && !this.isString && !this.inComment) {
          //011 = COMMENT
          //IF 011 SET 101
          this.isComment = true;
          this.isString = false;
          this.inComment = true;
        } else if (!this.isComment && !this.isString && !this.inComment) {
          //000 = STRING
          //IF 000 SET 110
          this.isComment = true;
          this.isString = true;
          this.inComment = false;
          this.fillCharBuffer(moduleName, row, column); //new string
        } else if (this.isComment && this.isString && !this.inComment) {
          //110 = END STRING
          //IF 110 SET 000
          this.isComment = false;
          this.isString = false;
          this.inComment = false;
        } else if (this.isComment && !this.isString && this.inComment) {
          //101 = END COMMENT
          //IF 101 SET 000
          this.isComment = true;
          this.isString = false;
          this.inComment = false;
        }

        if (this.isComment) {
          this.append(char);
        } else {
          this.append(char);
          this.fillCharBuffer(moduleName, row, column);
        }
        break;

      default:
        this.append(char);
        break;
    }
    this.lastChar = char;

  }
  getObject = async(string) => {
    let found = false;
    let matchLength = 0;
    let matchObject = {};
    if (typeof string === "string" && string.indexOf(".") > -1) {
      var stringtype = "NameSpace";
      if (parseInt(string.split(".")[1]) || string === "0.0") {
        stringtype = "OID";
      }
      let modules = Object.keys(this.modules);//, M_len = modules.length;

      for (let m = modules.length - 1; m >= 0; m--) {// search newset moduels first
        var mibMods = this.modules[modules[m]];
        var objects = Object.keys(mibMods);//, O_len = Objects.length;

        for (let o = 0; o < objects.length; o++) {
          var modObject = this.modules[modules[m]][objects[o]];
          if (modObject[stringtype] === string && !found) {
            found = true;
            return modObject;
          }
          if (string.indexOf(modObject[stringtype]) > -1 && !found) {
            var length = modObject[stringtype].split(".").length;
            if (length >= matchLength) {
              matchLength = length;
              matchObject = modObject;
            }
          }
        }


      }
    } else {

      var modules = Object.keys(this.modules);
      for (let m = modules.length - 1; m >= 0; m--) {// search newset moduels first
        if (this.modules[modules[m]][string]) {
          found = true;
          return this.modules[modules[m]][string];
        }
      }

    }
    if (!found) {
      return matchObject;
    }
    return undefined;
  }
  append = (char) => {
    this.builder += char;
  }

  fillCharBuffer = (moduleName, row) => {
    if (this.builder.length === 0) {
      return;
    }
    // column = (column - this.builder.length);
    const symbol = this.builder.toString().trim();
    this.builder = "";
    // this.builder.length = 0;
    if (!this.table[moduleName]) {
      this.table[moduleName] = [];
    }
    if (row === 0) {
      this.rowIndex = 0;
      this.previousRow = 0;
    }
    if (this.previousRow < row) {
      this.rowIndex++;
      this.columnIndex = 0;
      this.previousRow = row;
    }
    const r = this.rowIndex;
    const c = this.columnIndex;

    if (!this.table[moduleName][r]) {
      this.table[moduleName][r] = [];
    }
    this.isEqual = false;
    switch (symbol) {
      case ")":
        this.table[moduleName][r][c] = symbol;
        this.columnIndex++;
        this.logit = false;
        break;
      case "(":
        this.table[moduleName][r][c] = symbol;
        this.columnIndex++;
        this.logit = true;
        break;
      case "DEFINITIONS":
        this.moduleName[moduleName] = this.table[moduleName][r][c - 1];
        this.table[moduleName][r][c] = symbol;
        this.columnIndex++;
        break;
      case "::=":
        this.table[moduleName][r][c] = symbol;
        this.columnIndex++;
        this.isEqual = true;
        break;
      case "{":
        if (this.table[moduleName][r][c - 1] !== "::=") {
          this.isList = true;
        }
        this.table[moduleName][r][c] = symbol;
        this.columnIndex++;
        break;
      case "NOTATION":
        if (this.table[moduleName][r][c - 1] === "TYPE" || this.table[moduleName][r][c - 1] === "VALUE") {
          this.table[moduleName][r][c - 1] += " NOTATION";
        }
        break;

      case "OF":
        if (this.table[moduleName][r][c - 1] === "SEQUENCE") {
          this.table[moduleName][r][c - 1] = "SEQUENCE OF";
        }
        break;
      case "IDENTIFIER":
        if (this.table[moduleName][r][c - 1] === "OBJECT") {
          this.table[moduleName][r][c - 1] = "OBJECT IDENTIFIER";
        }
        break;
      case "STRING":
        if (this.table[moduleName][r][c - 1] === "OCTET") {
          this.table[moduleName][r][c - 1] = "OCTET STRING";
        }
        break;
      default:
        this.table[moduleName][r][c] = symbol;
        this.columnIndex++;
        break;
    }
  }
}
