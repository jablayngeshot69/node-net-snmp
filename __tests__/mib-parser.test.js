import path from "path";
import MIBParser from "../src/mib/parser";
import ModuleStore from "../src/module-store";

import OLDParser from "../lib/mib";

import {promisify} from "util";

export function promisifyAll(target, proto = Object.getPrototypeOf(target)) {
  target.async = Object.entries(proto)
    .filter(([_, value]) => typeof value === "function")
    .reduce((acc, [key, value]) => ({
      ...acc,
      [`${key}`]: promisify(value).bind(target),
    }), {});
  return target;
}

describe("mib parser", () => {
  it("import", async() => {
    const parser = new MIBParser();
    await parser.import(path.resolve(__dirname, "../mibs/SNMPv2-SMI.mib"));
    expect(parser.CharBuffer.Table).toHaveProperty("SNMPv2-SMI");
    const smiCharTable = parser.CharBuffer.Table["SNMPv2-SMI"];
    expect(smiCharTable[0]).toStrictEqual(["SNMPv2-SMI", "DEFINITIONS", "::=", "BEGIN"]);
    expect(smiCharTable[smiCharTable.length - 1]).toStrictEqual(["END"]);
    // expect(false).toBe(true);
  });
  it("serialize", async() => {
    const parser = new MIBParser();
    await parser.import(path.resolve(__dirname, "../mibs/SNMPv2-SMI.mib"));
    await parser.serialize();
    expect(parser.SymbolBuffer).toHaveProperty("SNMPv2-SMI");
    const symBuffer = parser.SymbolBuffer["SNMPv2-SMI"];
    expect(symBuffer[0]).toStrictEqual("SNMPv2-SMI");
    expect(symBuffer[symBuffer.length - 1]).toStrictEqual("END");

    // expect(false).toBe(true);
  });


  it("GetObject", async() => {
    const parser = new MIBParser();
    await Promise.all(ModuleStore.BASE_MODULES.map((bm) => {
      return parser.import(path.resolve(__dirname, `../mibs/${bm}.mib`));
    }));
    await parser.serialize();

    // const pParser = OLDParser();
    // promisifyAll(pParser, pParser);
    // ModuleStore.BASE_MODULES.forEach((bm) => {
    //   return pParser.Import(path.resolve(__dirname, `../mibs/${bm}.mib`));
    // });
    // await pParser.Serialize();



    const newOidInfo = await parser.getObject("1.3.6.1.2.1.1.1");
    expect(newOidInfo).toBeDefined();
    expect(newOidInfo.ObjectName).toBe("sysDescr");
    // .toStrictEqual({
    //   "ObjectName": "sysDescr",
    //   "ModuleName": "SNMPv2-MIB",
    //   "MACRO": "OBJECT-TYPE",
    //   "SYNTAX": "DisplayString",
    //   "MAX-ACCESS": "read-only",
    //   "STATUS": "current",
    //   "DESCRIPTION": "A textual description of the entity.  This value should\n            include the full name and version identification of\n            the system's hardware type, software operating-system,\n            and networking software.",
    //   "OBJECT IDENTIFIER": "system 1",
    //   "OID": "1.3.6.1.2.1.1.1",
    //   "NameSpace": "iso.org.dod.internet.mgmt.mib-2.system.sysDescr"
    // });
  });
});
