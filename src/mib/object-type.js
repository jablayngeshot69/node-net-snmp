
const ObjectType = {
  1: "Boolean",
  2: "Integer",
  4: "OctetString",
  5: "Null",
  6: "OID",
  64: "IpAddress",
  65: "Counter",
  66: "Gauge",
  67: "TimeTicks",
  68: "Opaque",
  70: "Counter64",
  128: "NoSuchObject",
  129: "NoSuchInstance",
  130: "EndOfMibView",
  "Boolean": 1,
  "Integer": 2,
  "OctetString": 4,
  "Null": 5,
  "OID": 6,
  "IpAddress": 64,
  "Counter": 65,
  "Gauge": 66,
  "TimeTicks": 67,
  "Opaque": 68,
  "Counter64": 70,
  "NoSuchObject": 128,
  "NoSuchInstance": 129,
  "EndOfMibView": 130,
};


// ASN.1
ObjectType.INTEGER = ObjectType.Integer;
ObjectType["OCTET STRING"] = ObjectType.OctetString;
ObjectType["OBJECT IDENTIFIER"] = ObjectType.OID;
// SNMPv2-SMI
ObjectType.Integer32 = ObjectType.Integer;
ObjectType.Counter32 = ObjectType.Counter;
ObjectType.Gauge32 = ObjectType.Gauge;
ObjectType.Unsigned32 = ObjectType.Gauge32;
// SNMPv2-TC
ObjectType.AutonomousType = ObjectType["OBJECT IDENTIFIER"];
ObjectType.DateAndTime = ObjectType["OCTET STRING"];
ObjectType.DisplayString = ObjectType["OCTET STRING"];
ObjectType.InstancePointer = ObjectType["OBJECT IDENTIFIER"];
ObjectType.MacAddress = ObjectType["OCTET STRING"];
ObjectType.PhysAddress = ObjectType["OCTET STRING"];
ObjectType.RowPointer = ObjectType["OBJECT IDENTIFIER"];
ObjectType.RowStatus = ObjectType.INTEGER;
ObjectType.StorageType = ObjectType.INTEGER;
ObjectType.TestAndIncr = ObjectType.INTEGER;
ObjectType.TimeStamp = ObjectType.TimeTicks;
ObjectType.TruthValue = ObjectType.INTEGER;
ObjectType.TAddress = ObjectType["OCTET STRING"];
ObjectType.TDomain = ObjectType["OBJECT IDENTIFIER"];
ObjectType.VariablePointer = ObjectType["OBJECT IDENTIFIER"];

export default ObjectType;
