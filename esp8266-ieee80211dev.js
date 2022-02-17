const ECN = ["OPEN", "WEP", "WPA PSK", "WPA2 PSK", "WPA WPA2 PSK", "WPA2-EAP"];

/**
 * ESP8266 IEEE802.11 Device
 */
class ESP8266IEEE80211Dev {
  constructor(at) {
    this._at = at;
    this._nets = [];
    this._conn = null;
    this.errno = 0;
    this.assoc_cb = null;
    this.connect_cb = null;
    this.disconnect_cb = null;

    // Event handlers
    this._at.addHandler("WIFI CONNECTED", () => {
      if (this.assoc_cb) this.assoc_cb();
    });
    /*
    this._at.addHandler('WIFI GOT IP', () => {
      this._at.send('AT+CIFSR', (r) => {
        if (r === 'OK') {
          if (this.connect_cb) this.connect_cb();
        }
      }, ['OK', 'ERROR', 'FAIL'], {prepend: true});
    });
    */
    this._at.addHandler("WIFI DISCONNECT", () => {
      if (global.__netdev) {
        global.__netdev.ip = null;
        global.__netdev.mac = null;
      }
      if (this.disconnect_cb) this.disconnect_cb();
    });
    this._at.addHandler("+CIFSR:STAIP,", (line) => {
      if (global.__netdev) {
        line = line.trim();
        global.__netdev.ip = line.substr(14, line.length - 15);
      }
    });
    this._at.addHandler("+CIFSR:STAMAC,", (line) => {
      if (global.__netdev) {
        line = line.trim();
        global.__netdev.mac = line.substr(15, line.length - 16);
      }
    });

    // Scan networks response
    this._at.addHandler("+CWLAP:", (line) => {
      line = line.trim();
      var n = line.substr(8, line.length - 10);
      var tokens = n.split(",");
      if (tokens.length >= 5) {
        try {
          var net = {
            security: ECN[Number(tokens[0])],
            ssid: JSON.parse(tokens[1]),
            rssi: Number(tokens[2]),
            bssid: JSON.parse(tokens[3]),
            channel: Number(tokens[4]),
          };
          this._nets.push(net);
        } catch (err) {
          console.error(`[esp8266-ieee80211dev] `, err.toString(), line);
        }
      }
    });

    // Current connection response
    this._at.addHandler("+CWJAP:", (line) => {
      line = line.trim();
      var c = line.substr(7, line.length - 7);
      if (c.length > 1) {
        var terms = c.split(",");
        this._conn = {
          ssid: JSON.parse(terms[0]),
          bssid: JSON.parse(terms[1]),
        };
      } else {
        // connection failed
        console.error(`[esp8266-ieee80211dev] Connection failed: ${c}`);
      }
    });
  }

  /**
   * Reset device
   * @param {function} cb
   */
  reset(cb) {
    this.errno = 0;
    this._nets = [];
    this._conn = null;
    this._at.send(
      "AT+RST",
      () => {
        this._at.send("AT+CWMODE=1", (r1) => {
          if (r1 === "OK") {
            this._at.send("AT+CIPMUX=1", (r2) => {
              if (r2 === "OK") {
                if (cb) cb(0);
              } else {
                this.errno = 5; // EIO
                if (cb) cb(this.errno);
              }
            });
          } else {
            this.errno = 5; // EIO
            if (cb) cb(this.errno);
          }
        });
      },
      1000
    );
  }

  /**
   * Scan networks
   * @param {function} cb
   */
  scan(cb) {
    this.errno = 0;
    this._nets = [];
    this._at.send("AT+CWLAP", (r) => {
      if (r === "OK") {
        if (cb) {
          cb(0, this._nets);
          this._nets = [];
        }
      } else {
        this.errno = 5; // EIO
        if (cb) cb(this.errno);
      }
    });
  }

  /**
   * Connect to network
   * @param {object} connectInfo
   *   .ssid {string}
   *   .password {string}
   * @param {function} cb
   */
  connect(connectInfo, cb) {
    this.errno = 0;
    var cmd = 'AT+CWJAP="' + connectInfo.ssid + '"';
    if (connectInfo.password) {
      cmd += ',"' + connectInfo.password + '"';
    } else {
      cmd += '""';
    }
    this._at.send(cmd, (r) => {
      if (r === "OK") {
        this._at.send("AT+CIFSR", (r2) => {
          if (r2 === "OK") {
            if (this.connect_cb) this.connect_cb();
            if (cb) cb(0);
          } else {
            this.errno = 111; // ECONNREFUSED
            if (cb) cb(this.errno);
          }
        });
      } else {
        this.errno = 111; // ECONNREFUSED
        if (cb) cb(this.errno);
      }
    });
  }

  /**
   * Disconnect the current network connection
   * @param {function} cb
   */
  disconnect(cb) {
    this.errno = 0;
    this._at.send("AT+CWQAP", (r) => {
      if (r === "OK") {
        if (global.__netdev) {
          global.__netdev.ip = null;
          global.__netdev.mac = null;
        }
        if (cb) cb(0);
      } else {
        this.errno = 5; // EIO
        if (cb) cb(this.errno);
      }
    });
  }

  /**
   * Get the current network connection
   * @param {function(err,connectionInfo)} cb
   *   connectionInfo = null, if has no connection
   */
  get_connection(cb) {
    this.errno = 0;
    this._conn = null;
    this._at.send("AT+CWJAP?", (r) => {
      if (r === "OK") {
        if (cb) cb(0, this._conn);
      } else {
        this.errno = 5; // EIO
        if (cb) cb(this.errno);
      }
    });
  }
}

exports.ESP8266IEEE80211Dev = ESP8266IEEE80211Dev;
