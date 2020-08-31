import path from "path";

import NewMIB from "../src/mib";
import OldMIB from "../lib/mib";


describe("mibs", () => {
  it("import", async() => {
    const newMib = new NewMIB();
    await newMib.import(path.resolve(__dirname, "../mibs/SNMPv2-SMI.mib"));
    const oldMIB = new OldMIB();
    await oldMIB.Import(path.resolve(__dirname, "../mibs/SNMPv2-SMI.mib"));


    console.log("result ");
    expect(true).toEqual("false");
  });
});
