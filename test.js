var WiFi = require("wifi").WiFi;
var http = require("http");
var net = require("net");

var ESP8266Mock = require("./test-esp8266-mock").ESP8266Mock;
var esp8266_driver = require("./index");

var jest = require("micro-jest");
var test = jest.test;
var expect = jest.expect;

// var debug = true;
var debug = false;

function readyWiFi(mock, done) {
  esp8266_driver
    .setup(mock, { debug: debug })
    .then(() => {
      var wifi = new WiFi();
      var conn = { ssid: "test-ssid", password: "test-pwd" };
      wifi.connect(conn, (err) => {
        if (err) {
          done(err);
        } else {
          done();
        }
      });
    })
    .catch((err) => {
      done(err);
    });
}

function readyNetServer(m, done) {
  readyWiFi(m, (err) => {
    if (err) {
      done(err);
    } else {
      var port = 80;
      var event_listening = 0;
      var server = net.createServer();
      server.on("listening", () => {
        event_listening++;
      });
      server.on("error", (err2) => {
        done(err2);
      });
      server.listen(port, function () {
        expect(event_listening).toBe(1);
        done(null, server);
      });
    }
  });
}

function readyHttpServer(m, done) {
  readyWiFi(m, (err) => {
    if (err) {
      done(err);
    } else {
      var port = 80;
      var event_listening = 0;
      var server = http.createServer();
      server.on("listening", () => {
        event_listening++;
      });
      server.listen(port, function () {
        expect(event_listening).toBe(1);
        done(null, server);
      });
    }
  });
}

test("[esp8266-driver] setup", (done) => {
  var esp8266mock = new ESP8266Mock();
  esp8266_driver
    .setup(esp8266mock, { debug: debug })
    .then(() => {
      expect(global.__netdev).toBeTruthy();
      expect(global.__ieee80211dev).toBeTruthy();
      done();
    })
    .catch((err) => {
      done(err);
    });
});

test("[wifi] connect & disconnect", (done) => {
  var esp8266mock = new ESP8266Mock();
  esp8266_driver
    .setup(esp8266mock, { debug: debug })
    .then(() => {
      var wifi = new WiFi();
      var conn = { ssid: "test-ssid", password: "test-pwd" };
      var event_asso = 0;
      var event_conn = 0;
      var event_disc = 0;
      wifi.on("associated", () => {
        event_asso++;
      });
      wifi.on("connected", () => {
        event_conn++;
      });
      wifi.on("disconnected", () => {
        event_disc++;
      });
      wifi.connect(conn, (err) => {
        if (err) {
          done(err);
        } else {
          expect(esp8266mock._rxbuf).toContain(
            `AT+CWJAP="${conn.ssid}","${conn.password}"\r\n`
          );
          expect(__netdev.ip).toBe(esp8266mock._ip);
          expect(__netdev.mac).toBe(esp8266mock._mac);
          expect(event_asso).toBe(1);
          expect(event_conn).toBe(1);
          expect(event_disc).toBe(0);
          setTimeout(() => {
            wifi.disconnect((err2) => {
              if (err2) {
                done(err2);
              } else {
                expect(__netdev.ip).toBeFalsy();
                expect(__netdev.mac).toBeFalsy();
                setTimeout(() => {
                  expect(event_disc).toBe(1);
                  done();
                }, 1000);
              }
            });
          }, 2000);
        }
      });
    })
    .catch((err) => {
      done(err);
    });
});

test("[wifi] scan", (done) => {
  var esp8266mock = new ESP8266Mock();
  esp8266_driver
    .setup(esp8266mock, { debug: debug })
    .then(() => {
      var wifi = new WiFi();
      wifi.scan((err, scanResults) => {
        if (err) {
          done(err);
        } else {
          expect(scanResults.length).toBe(2); // 2 APs
          expect(scanResults[0].security).toBe("WPA2 PSK");
          expect(scanResults[0].ssid).toBe("niklaus");
          expect(scanResults[0].bssid).toBe("90:9f:33:d3:04:be");
          expect(scanResults[0].channel).toBe(11);
          expect(scanResults[0].rssi).toBe(-49);
          expect(scanResults[1].security).toBe("WPA WPA2 PSK");
          expect(scanResults[1].ssid).toBe("SK_WiFiGIGA9104");
          expect(scanResults[1].bssid).toBe("00:23:aa:c1:91:06");
          expect(scanResults[1].channel).toBe(3);
          expect(scanResults[1].rssi).toBe(-51);
          done();
        }
      });
    })
    .catch((err) => {
      done(err);
    });
});

test("[net] socket connect", (done) => {
  var esp8266mock = new ESP8266Mock();
  readyWiFi(esp8266mock, (err) => {
    if (err) {
      done(err);
    } else {
      var event_conn = 0;
      var event_ready = 0;
      var conn = { host: "192.168.0.11", port: 3000 };
      var sock = net.createConnection(conn, () => {
        event_conn++;
        expect(event_conn).toBe(1);
        // TODO: sock.localAddress
        // TODO: sock.localPort
        // TODO: sock.remoteAddress
        // TODO: sock.remotePort
      });
      sock.on("ready", () => {
        event_ready++;
        // ready is occurred immediately after connect
        expect(event_conn).toBe(1);
        expect(event_ready).toBe(1);
        done();
      });
      sock.on("error", (err2) => {
        done(err2);
      });
    }
  });
});

test("[net] socket close", (done) => {
  var esp8266mock = new ESP8266Mock();
  readyWiFi(esp8266mock, (err) => {
    if (err) {
      done(err);
    } else {
      var event_close = 0;
      var conn = { host: "192.168.0.11", port: 3000 };
      var sock = net.createConnection(conn, () => {
        setTimeout(() => {
          sock.destroy();
          setTimeout(() => {
            expect(event_close).toBe(1);
            done();
          }, 500);
        }, 500);
      });
      sock.on("close", () => {
        event_close++;
      });
      sock.on("error", (err2) => {
        done(err2);
      });
    }
  });
});

test("[net] socket sends data", (done) => {
  var esp8266mock = new ESP8266Mock();
  readyWiFi(esp8266mock, (err) => {
    if (err) {
      done(err);
    } else {
      var conn = { host: "192.168.0.11", port: 3000 };
      var sock = net.createConnection(conn, () => {
        sock.write("0123456789\r\n");
        sock.write("abcdefghijklmnopqrstuvwxyz\r\n");
        sock.write("ABCDEFGHIJKLMNOPQRSTUVWXYZ\r\n");
        setTimeout(() => {
          var last = esp8266mock._rxbuf[esp8266mock._rxbuf.length - 1];
          expect(last).toMatch(/0123456789\r\n/);
          expect(last).toMatch(/abcdefghijklmnopqrstuvwxyz\r\n/);
          expect(last).toMatch(/ABCDEFGHIJKLMNOPQRSTUVWXYZ\r\n/);
          done();
        }, 1000);
      });
      sock.on("error", (err2) => {
        done(err2);
      });
    }
  });
});

test("[net] socket receives data", (done) => {
  var esp8266mock = new ESP8266Mock();
  readyWiFi(esp8266mock, (err) => {
    if (err) {
      done(err);
    } else {
      var conn = { host: "192.168.0.11", port: 3000 };
      var sock = net.createConnection(conn, () => {
        var _buf = "";
        sock.on("data", (data) => {
          _buf += String.fromCharCode.apply(null, data);
        });
        setTimeout(() => {
          expect(_buf.length).toBe(68);
          expect(_buf).toMatch(/0123456789\r\n/);
          expect(_buf).toMatch(/abcdefghijklmnopqrstuvwxyz\r\n/);
          expect(_buf).toMatch(/ABCDEFGHIJKLMNOPQRSTUVWXYZ\r\n/);
          done();
        }, 1000);
        esp8266mock._tx(
          [
            "+IPD,0,68:0123456789",
            "abcdefghijklmnopqrstuvwxyz",
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
          ],
          100
        );
      });
      sock.on("error", (err2) => {
        done(err2);
      });
    }
  });
});

test("[net] server start", (done) => {
  var esp8266mock = new ESP8266Mock();
  readyNetServer(esp8266mock, (err) => {
    if (err) {
      done(err);
    } else {
      done();
    }
  });
});

test("[net] server stop", (done) => {
  var esp8266mock = new ESP8266Mock();
  readyNetServer(esp8266mock, (err, server) => {
    if (err) {
      done(err);
    } else {
      var event_close = 0;
      server.on("close", () => {
        event_close++;
      });
      setTimeout(() => {
        server.close(() => {
          expect(event_close).toBe(1);
          done();
        });
      }, 1000);
    }
  });
});

test("[net] server accepts connection and close", (done) => {
  var esp8266mock = new ESP8266Mock();
  readyNetServer(esp8266mock, (err, server) => {
    if (err) {
      done(err);
    } else {
      server.on("connection", (c) => {
        expect(c).toBeTruthy();
        expect(c instanceof net.Socket).toBe(true);
        // TODO: c.localAddress
        // TODO: c.localPort
        // TODO: c.remoteAddress
        // TODO: c.remotePort
        c.on("close", () => {
          done();
        });
        setTimeout(() => {
          c.destroy();
        }, 1000);
      });
      esp8266mock._tx("0", 100);
      esp8266mock._tx(",CONNECT\r\n", 110);
    }
  });
});

test("[net] server receives data", (done) => {
  var esp8266mock = new ESP8266Mock();
  readyNetServer(esp8266mock, (err, server) => {
    if (err) {
      done(err);
    } else {
      server.on("connection", (c) => {
        c.on("data", (data) => {
          var str = String.fromCharCode.apply(null, data);
          expect(str.length).toBe(466);
          done();
        });
      });
      esp8266mock._tx("0,CONNECT\r\n", 100);
      esp8266mock._tx(
        [
          "+IPD,0,466:GET / HTTP/1.1",
          "Host: 192.168.0.15",
          "Connection: keep-alive",
          "Upgrade-Insecure-Requests: 1",
        ],
        200
      );
      esp8266mock._tx(
        [
          "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.85 Safari/537.36",
          "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
          "Accept-Encoding: gzip, deflate",
          "Accept-Language: ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7,ja;q=0.6",
          "",
        ],
        400
      );
    }
  });
});

test("[net] server sends data", (done) => {
  var esp8266mock = new ESP8266Mock();
  readyNetServer(esp8266mock, (err, server) => {
    if (err) {
      done(err);
    } else {
      server.on("connection", (c) => {
        var data = "0123456789abcdefghijklmnopqrstuvwxyz"; // 36 bytes
        c.write(data);
        setTimeout(() => {
          expect(esp8266mock._rxbuf).toContain("AT+CIPSEND=0,36\r\n");
          expect(esp8266mock._rxbuf).toContain(data); // sent to client
          done();
        }, 1000);
      });
      esp8266mock._tx("0,CONNECT\r\n", 100);
    }
  });
});

test("[http] server start", (done) => {
  var esp8266mock = new ESP8266Mock();
  readyHttpServer(esp8266mock, (err) => {
    if (err) {
      done(err);
    } else {
      done();
    }
  });
});

test("[http] server stop", (done) => {
  var esp8266mock = new ESP8266Mock();
  readyHttpServer(esp8266mock, (err, server) => {
    if (err) {
      done(err);
    } else {
      var event_close = 0;
      server.on("close", () => {
        event_close++;
      });
      setTimeout(() => {
        server.close(() => {
          expect(event_close).toBe(1);
          done();
        });
      }, 1000);
    }
  });
});

test("[http] sends GET request", (done) => {
  var esp8266mock = new ESP8266Mock();
  readyWiFi(esp8266mock, (err) => {
    if (err) {
      done(err);
    } else {
      var options = {
        host: "192.168.0.11",
        port: 3000,
        method: "GET",
        path: "/hello",
        headers: {
          Host: "192.168.0.11",
        },
      };
      var req = http.request(options, (res) => {
        expect(res.httpVersion).toBe("1.1");
        expect(res.statusCode).toBe(200);
        expect(res.statusMessage).toBe("OK");
        expect(res.headers["content-type"]).toBe("text/plain");
        expect(res.headers.connection).toBe("keep-alive");
        expect(res.headers["keep-alive"]).toBe("timeout=5");
        expect(res.headers["transfer-encoding"]).toBe("chunked");
        var body = "";
        res.on("data", (data) => {
          var chunk = String.fromCharCode.apply(null, data);
          body += chunk;
        });
        res.on("end", () => {
          expect(body).toBe(
            "Hello world!This is the infomation sent to the client"
          );
          done();
        });
        res.on("error", (err2) => {
          done(err2);
        });
      });
      req.end();
      // esp8266 sends response and close the connection
      esp8266mock._tx(
        [
          "+IPD,0,226:HTTP/1.1 200 OK",
          "Content-Type: text/plain",
          "Date: Tue, 27 Apr 2021 09:40:36 GMT",
          "Connection: keep-alive",
          "Keep-Alive: timeout=5",
          "Transfer-Encoding: chunked",
          "",
          "c",
          "Hello world!",
          "29",
          "This is the infomation sent to the client",
          "0",
          "",
        ],
        2000
      );
      esp8266mock._tx(["0,CLOSED"], 2100);
    }
  });
});

test("[http] server accepts request", (done) => {
  var esp8266mock = new ESP8266Mock();
  readyHttpServer(esp8266mock, (err, server) => {
    if (err) {
      done(err);
    } else {
      server.on("request", (req, res) => {
        expect(req).toBeTruthy();
        expect(req.httpVersion).toBe("1.1");
        expect(req.method).toBe("GET");
        // TODO: Header should be parsed
        expect(req.headers.host).toBe("192.168.0.15");
        expect(req.headers.connection).toBe("keep-alive");
        expect(res).toBeTruthy();
        done();
      });
      esp8266mock._tx("0,CONNECT\r\n", 10);
      esp8266mock._tx(
        [
          "+IPD,0,466:GET / HTTP/1.1",
          "Host: 192.168.0.15",
          "Connection: keep-alive",
          "Upgrade-Insecure-Requests: 1",
          "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.85 Safari/537.36",
          "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,s/s;q=0.8,application/signed-exchange;v=b3;q=0.9",
          "Accept-Encoding: gzip, deflate",
          "Accept-Language: ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7,ja;q=0.6",
          "",
        ],
        20
      );
    }
  });
});

test("[http] server accepts multiple requests", (done) => {
  var esp8266mock = new ESP8266Mock();
  readyHttpServer(esp8266mock, (err, server) => {
    if (err) {
      done(err);
    } else {
      var reqs = [];
      server.on("request", (req, res) => {
        reqs.push({ req: req, res: res });
        if (reqs.length === 2) {
          // reqs[0]
          expect(reqs[0].req).toBeTruthy();
          expect(reqs[0].req.httpVersion).toBe("1.1");
          expect(reqs[0].req.method).toBe("GET");
          expect(reqs[0].req.url).toBe("/favicon.ico");
          expect(reqs[0].req.headers.host).toBe("192.168.0.15");
          expect(reqs[0].req.headers.connection).toBe("keep-alive");
          expect(reqs[0].res).toBeTruthy();
          // reqs[1]
          expect(reqs[1].req).toBeTruthy();
          expect(reqs[1].req.httpVersion).toBe("1.1");
          expect(reqs[1].req.method).toBe("GET");
          expect(reqs[1].req.url).toBe("/html");
          expect(reqs[1].req.headers.host).toBe("192.168.0.15");
          expect(reqs[1].req.headers.connection).toBe("keep-alive");
          expect(reqs[1].res).toBeTruthy();
          done();
        }
      });
      esp8266mock._tx(
        [
          "0,CONNECT",
          "1,CONNECT",
          "+IPD,0,454:GET /favicon.ico HTTP/1.1",
          "Host: 192.168.0.15",
          "Connection: keep-alive",
          "Pragma: no-cache",
          "Cache-Control: no-cache",
          "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36",
          "Accept: image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Referer: http://192.168.0.15/html",
          "Accept-Encoding: gzip, deflate",
          "Accept-Language: ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7,ja;q=0.6",
          "",
          "",
          "+IPD,1,496:GET /html HTTP/1.1",
          "Host: 192.168.0.15",
          "Connection: keep-alive",
          "Cache-Control: max-age=0",
          "Upgrade-Insecure-Requests: 1",
          "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36",
          "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
          "Accept-Encoding: gzip, deflate",
          "Accept-Language: ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7,ja;q=0.6",
          "",
        ],
        10
      );
    }
  });
});

// global.jest = jest;
jest.start();
