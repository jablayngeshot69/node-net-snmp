import path from "path";
// import MIB from "../src/mib";
import ModuleStore from "../src/module-store";
import rfc1158ProviderData from "../.jest/rfc1158-provider.json";

describe("module store", () => {
  it("loadBaseModules", async() => {
    const moduleStore = new ModuleStore();
    await moduleStore.loadBaseModules();
  });
  it("getProvidersForModule", async() => {
    const moduleStore = new ModuleStore();
    await moduleStore.loadBaseModules();
    const rfc1158Provider = moduleStore.getProvidersForModule("RFC1158-MIB");
    expect(JSON.parse(JSON.stringify(rfc1158Provider))).toStrictEqual(rfc1158ProviderData);
  });

});
