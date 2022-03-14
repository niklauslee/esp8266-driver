const MAX_CONNECTIONS = 5;

/**
 * ESP8266 Network Device
 * @param {ATCommand} at
 */
class ESP8266NetDev {
  constructor(at) {
    this._at = at;
    this._sockets = new Array(MAX_CONNECTIONS + 1); // include a server socket

    this.errno = 0; // system error code
    this.mac = null;
    this.ip = null; // local ip address. should be assigned by ethernet, wifi, gsm, etc.
    this.subnet = null;
    this.dns = null;
    this.gateway = null;

    // AT response handler (+IPD)
    this._at.addHandler("+IPD,", (line, buffer) => {
      buffer = line + buffer;
      var idx = buffer.indexOf("+IPD,");
      if (idx > -1) {
        var pos = buffer.indexOf(":", idx);
        if (pos > -1) {
          var cmd = buffer.substr(idx, pos).trim();
          var terms = cmd.split(",");
          var linkid = parseInt(terms[1]);
          var len = parseInt(terms[2]);
          if (buffer.length > pos + len) {
            var sck = this._getByLinkId(linkid);
            if (sck) {
              if (sck.read_cb) {
                var data = buffer.substr(pos + 1, len);
                var encoder = new TextEncoder("ascii");
                var buf = encoder.encode(data);
                sck.read_cb(buf);
              }
            }
            return buffer.substr(pos + len + 1);
          }
        }
      }
      return false;
    });

    // close handler
    var closeHandler = (line) => {
      line = line.trim();
      var linkid = parseInt(line.split(",")[0]);
      var sck = this._getByLinkId(linkid);
      if (sck) {
        sck._linkid = null;
        sck.state = 0;
        this._sockets[sck.fd] = null;
        if (sck.shutdown_cb) sck.shutdown_cb();
        if (sck.close_cb) sck.close_cb();
      }
    };
    this._at.addHandler("0,CLOSED", closeHandler);
    this._at.addHandler("1,CLOSED", closeHandler);
    this._at.addHandler("2,CLOSED", closeHandler);
    this._at.addHandler("3,CLOSED", closeHandler);
    this._at.addHandler("4,CLOSED", closeHandler);
    this._at.addHandler("0,CONNECT FAIL", closeHandler);
    this._at.addHandler("1,CONNECT FAIL", closeHandler);
    this._at.addHandler("2,CONNECT FAIL", closeHandler);
    this._at.addHandler("3,CONNECT FAIL", closeHandler);
    this._at.addHandler("4,CONNECT FAIL", closeHandler);

    // connect handlers
    var connectHandler = (line) => {
      line = line.trim();
      var linkid = parseInt(line.split(",")[0]);
      var sck = this._getByLinkId(linkid);
      if (sck) {
        // as client
        if (sck.connect_cb) sck.connect_cb();
        /*
        this._at.send('AT+CIPSTATUS', (r) => {
          if (r === 'OK') {
            if (sck.connect_cb) sck.connect_cb();
          }
        }, ['OK', 'ERROR', 'FAIL']);
        */
      } else {
        // accept from server
        var fd = this.socket(null, "STREAM");
        sck = this.get(fd);
        sck._linkid = linkid;
        sck.state = 2;
        var svrsck = this._getServer();
        if (svrsck) {
          if (svrsck.accept_cb) svrsck.accept_cb(fd);
        }
      }
    };
    this._at.addHandler("0,CONNECT", connectHandler);
    this._at.addHandler("1,CONNECT", connectHandler);
    this._at.addHandler("2,CONNECT", connectHandler);
    this._at.addHandler("3,CONNECT", connectHandler);
    this._at.addHandler("4,CONNECT", connectHandler);

    // socket status handler
    this._at.addHandler("+CIPSTATUS:", (line) => {
      line = line.trim();
      var n = line.substr(11);
      var tokens = n.split(",");
      if (tokens.length > 5) {
        try {
          var _linkid = parseInt(tokens[0]);
          var sck = this._getByLinkId(_linkid);
          if (sck) {
            sck.raddr = JSON.parse(tokens[2]);
            sck.rport = parseInt(tokens[3]);
            sck.laddr = this.ip;
            sck.lport = parseInt(tokens[4]);
          }
        } catch (err) {
          console.error(err, line);
        }
      }
    });
  }

  /**
   * Get socket object by link id
   */
  _getByLinkId(linkid) {
    for (var fd = 0; fd < this._sockets.length; fd++) {
      if (this._sockets[fd] && this._sockets[fd]._linkid === linkid) {
        return this._sockets[fd];
      }
    }
    return null;
  }

  /**
   * Get a listening server socket
   */
  _getServer() {
    for (var fd = 0; fd < this._sockets.length; fd++) {
      if (this._sockets[fd] && this._sockets[fd].state === 3) {
        return this._sockets[fd];
      }
    }
    return null;
  }

  /**
   * Get a new link id of esp8266
   */
  _newLinkId() {
    for (var i = 0; i < MAX_CONNECTIONS; i++) {
      var sck = this._getByLinkId(i);
      if (!sck) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Create a socket
   * @param {string} domain 'AF_INET' only
   * @param {string} protocol 'STREAM' or 'DGRAM'
   * @return {number} socket fd, or -1 on error.
   */
  socket(domain, protocol) {
    this.errno = 0;
    if (protocol !== "STREAM" && protocol !== "DGRAM") {
      this.errno = 96; // EPFNOSUPPORT
      return -1;
    }
    for (var i = 0; i < this._sockets.length; i++) {
      if (!this._sockets[i]) {
        var fd = i;
        var sck = {
          _linkid: null, // link id
          fd: fd, // socket fd
          ptcl: protocol,
          state: 0, // 0=closed, 1=bind, 2=connected, 3=listening
          laddr: "0.0.0.0",
          lport: 0,
          raddr: "0.0.0.0",
          rport: 0,
          connect_cb: null,
          close_cb: null,
          read_cb: null,
          accept_cb: null,
          shutdown_cb: null,
        };
        this._sockets[fd] = sck;
        return fd;
      }
    }
    this.errno = 24; // EMFILE
    return -1;
  }

  /**
   * Get a socket object.
   * @param {number} socket fd
   * @return {object} socket object. Error is set to errno.
   */
  get(fd) {
    this.errno = 0;
    var sck = this._sockets[fd];
    if (sck) {
      return sck;
    } else {
      this.errno = 9; // EBADF
      return null;
    }
  }

  /**
   * Establish a socket connection
   * @param {number} socket id
   * @param {string} host
   * @param {string} port
   * @param {function} cb
   *   - err {number} error code
   *   - sck {object} socket object
   */
  connect(fd, addr, port, cb) {
    this.errno = 0;
    var sck = this._sockets[fd];
    if (sck) {
      var ptcl = sck.ptcl === "DGRAM" ? "UDP" : "TCP";
      sck._linkid = this._newLinkId();
      if (sck._linkid > -1) {
        this._at.send(
          `AT+CIPSTART=${sck._linkid},"${ptcl}","${addr}",${port}`,
          (r) => {
            if (r === "OK") {
              sck.state = 2; // connected
              sck.laddr = "";
              sck.lport = 0;
              sck.raddr = addr;
              sck.rport = port;
              if (cb) cb(0, sck);
            } else if (r === "TIMEOUT") {
              sck._linkid = null;
              this.errno = 110; // ETIMEDOUT
              if (cb) cb(this.errno, sck);
            } else {
              sck._linkid = null;
              this.errno = 111; // ECONNREFUSED
              if (cb) cb(this.errno, sck);
            }
          }
        );
      } else {
        this.errno = 24; // EMFILE
        if (cb) cb(this.errno);
      }
    } else {
      this.errno = 9; // EBADF
      if (cb) cb(this.errno);
    }
  }

  /**
   * Close a socket
   * @param {number} socket fd
   */
  close(fd, cb) {
    this.errno = 0;
    var sck = this._sockets[fd];
    if (sck) {
      if (sck.state === 3) {
        // server socket
        this._at.send(`AT+CIPSERVER=0`, (r) => {
          if (r === "OK") {
            sck._linkid = null;
            sck.state = 0;
            this._sockets[fd] = null;
            if (sck.close_cb) sck.close_cb();
            if (cb) cb(0);
          } else if (r === "ERROR") {
            this.errno = 70; // ECOMM
            if (cb) cb(this.errno);
          }
        });
      } else {
        // client socket
        this._at.send(
          `AT+CIPCLOSE=${sck._linkid}`,
          (r) => {
            if (r === "OK") {
              sck._linkid = null;
              sck.state = 0;
              this._sockets[fd] = null;
              if (cb) cb(0);
            } else if (r === "ERROR") {
              this.errno = 107; // ENOTCONN
              if (cb) cb(this.errno);
            }
          },
          ["UNLINK", "OK", "ERROR"]
        );
      }
    } else {
      this.errno = 9; // EBADF
      if (cb) cb(this.errno);
    }
  }

  /**
   * Shutdown socket
   * @param {number} socket fd
   * @param {number} how  SHUT_RD=0, SHUT_WR=1, SHUT_RDWR=2
   * @param {function} cb
   *
   * Half-open/close is not supported in ESP8266 AT Command.
   * Actually it does the same with close().
   */
  shutdown(fd, how, cb) {
    /* eslint-disable-line */
    // this.close(fd, cb);
    this.errno = 0;
    var sck = this._sockets[fd];
    if (sck) {
      if (cb) cb(0);
    } else {
      this.errno = 9; // EBADF
      if (cb) cb(this.errno);
    }
  }

  /**
   * Send data
   * @param {number} socket fd
   * @param {Uint8Array|string} data
   * @param {function} cb
   */
  write(fd, data, cb) {
    this.errno = 0;
    var sck = this._sockets[fd];
    if (!sck) {
      this.errno = 9; // EBADF
      if (cb) cb(this.errno);
    }
    // Split the data into multiple packets
    let packets = Array(Math.ceil(data.length / 1460)).fill(null).map((_, i) => {
      return data.slice(i * 1460, (i + 1) * 1460);
    });
    // A recursion function to send these packets
    const send_packet = (i) => {
      this._at.send(`AT+CIPSEND=${sck._linkid},${packets[i].length}`, (r) => {
        if (r === 'OK') {
          this._at.send(packets[i], (r2) => {
            if (r2 === 'SEND OK') {
              if (i < packets.length - 1) {
                send_packet(i + 1);
              } else {
                if (cb) cb(0);
              }
            } else if (r2 === 'TIMEOUT') {
              this.errno = 110; // ETIMEDOUT
              if (cb) cb(this.errno, sck);
            } else {
              this.errno = 70; // ECOMM
              if (cb) cb(this.errno);
            }
          }, ['SEND OK', 'SEND FAIL', 'ERROR'], { sendAsData: true });
        } else {
          this.errno = 70; // ECOMM
          if (cb) cb(this.errno);
        }
      });
    };
    send_packet(0);
  }

  /**
   * Bind address to socket
   * @param {number} socket fd
   * @param {string} addr
   * @param {number} port
   * @param {function} cb
   */
  bind(fd, addr, port, cb) {
    this.errno = 0;
    var sck = this._sockets[fd];
    if (sck) {
      sck.state = 1;
      sck.raddr = addr;
      sck.rport = port;
      if (cb) cb(0);
    } else {
      this.errno = 9; // EBADF
      if (cb) cb(this.errno);
    }
  }

  /**
   * Listen
   */
  listen(fd, cb) {
    this.errno = 0;
    var sck = this._sockets[fd];
    if (sck) {
      sck._linkid = null;
      this._at.send(`AT+CIPSERVER=1,${sck.rport}`, (r) => {
        if (r === "OK") {
          sck.state = 3; // listen
          if (cb) cb(0);
        } else {
          this.errno = 70; // ECOMM
          if (cb) cb(this.errno);
        }
      });
    } else {
      this.errno = 9; // EBADF
      if (cb) cb(this.errno);
    }
  }
}

exports.ESP8266NetDev = ESP8266NetDev;
