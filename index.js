const { ATCommand } = require("at");
const { ESP8266NetDev } = require("./esp8266-netdev");
const { ESP8266IEEE80211Dev } = require("./esp8266-ieee80211dev");

exports.setup = function (serial, options) {
  return new Promise((resolve, reject) => {
    if (!serial) {
      let UART = require("uart").UART;
      serial = new UART(0, { baudrate: 115200, bufferSize: 4096 });
    }
    let at = new ATCommand(serial, options);
    global.__netdev = new ESP8266NetDev(at);
    global.__ieee80211dev = new ESP8266IEEE80211Dev(at);
    global.__ieee80211dev.reset((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};
