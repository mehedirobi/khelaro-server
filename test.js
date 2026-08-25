const dns = require("node:dns");

dns.setServers(["1.1.1.1", "8.8.8.8"]);

dns.resolveSrv(
  "_mongodb._tcp.cluster0.yvhjyyn.mongodb.net",
  (err, addresses) => {
    if (err) {
      console.error("DNS Error:", err);
    } else {
      console.log(addresses);
    }
  }
);