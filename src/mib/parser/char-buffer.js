

export default class CharBuffer {
  constructor() {
    this.logit = false;
    this.lastChar = "";
    this.state = "";
    this.open = false;
    this.CurrentSymbol = "";
    this.nested = 0;
    this.isComment = false;
    this.isEqual = false;
    this.isOID = false;
    this.isList = false;
    this.isString = false;
    this.inComment = false;
    this.inGroup = 0;
    this.builder = "";
    this.Table = {};
    this.ColumnIndex = 0;
    this.RowIndex = 0;
    this.ModuleName = {};
    this.PreviousRow = 0;
  }

  append = (char) => {
    this.builder += char;
  }
  fill = (fileName, row, column) => {
    if (this.builder.length === 0) {
      return;
    }
    column = (column - this.builder.length);
    var symbol = this.builder.toString().trim();
    this.builder = "";
    if (!this.Table[fileName]) {
      this.Table[fileName] = [];
    }
    if (row === 0) {
      this.RowIndex = 0;
      this.PreviousRow = 0;
    }
    if (this.PreviousRow < row) {
      this.RowIndex++;
      this.ColumnIndex = 0;
      this.PreviousRow = row;

    }
    var R = this.RowIndex;
    var C = this.ColumnIndex;

    if (!this.Table[fileName][R]) {
      this.Table[fileName][R] = [];
    }
    this.isEqual = false;
    switch (symbol) {
      case ")":
        this.Table[fileName][R][C] = symbol;
        this.ColumnIndex++;
        this.logit = false;
        break;
      case "(":
        this.Table[fileName][R][C] = symbol;
        this.ColumnIndex++;
        this.logit = true;
        break;
      case "DEFINITIONS":
        this.ModuleName[fileName] = this.Table[fileName][R][C - 1];
        this.Table[fileName][R][C] = symbol;
        this.ColumnIndex++;
        break;
      case "::=":
        this.Table[fileName][R][C] = symbol;
        this.ColumnIndex++;
        this.isEqual = true;
        break;
      case "{":
        if (this.Table[fileName][R][C - 1] !== "::=") {
          this.isList = true;
        }
        this.Table[fileName][R][C] = symbol;
        this.ColumnIndex++;
        break;
      case "NOTATION":
        if (this.Table[fileName][R][C - 1] === "TYPE" || this.Table[fileName][R][C - 1] === "VALUE") {
          this.Table[fileName][R][C - 1] += " NOTATION";
        }
        break;

      case "OF":
        if (this.Table[fileName][R][C - 1] === "SEQUENCE") {
          this.Table[fileName][R][C - 1] = "SEQUENCE OF";
        }
        break;
      case "IDENTIFIER":
        if (this.Table[fileName][R][C - 1] === "OBJECT") {
          this.Table[fileName][R][C - 1] = "OBJECT IDENTIFIER";
        }
        break;
      case "STRING":
        if (this.Table[fileName][R][C - 1] === "OCTET") {
          this.Table[fileName][R][C - 1] = "OCTET STRING";
        }
        break;
      default:
        this.Table[fileName][R][C] = symbol;
        this.ColumnIndex++;
        break;
    }
  }
}
