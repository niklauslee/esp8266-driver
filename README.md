> **THIS DRIVER IS EXPERIMENTAL**
> Currently this driver is not stable, so we recommend to use ESP8266 AT commands directly.

# ESP8266-driver

Kaluma network device driver for ESP8266 module (AT command). This module implements [netdev](https://docs.kaluma.io/api-reference/device_driver#netdev) and [ieee80211dev](https://docs.kaluma.io/api-reference/device_driver#ieee-80211-dev) device drivers using ESP8266 AT commands. With this device drivers you can use following builtin modules:

- [wifi](https://docs.kaluma.io/api-reference/wifi)
- [net](https://docs.kaluma.io/api-reference/net)
- [http](https://docs.kaluma.io/api-reference/http)

Tested firmware versions:

| Module | Manufacturer                   | AT version | SDK version |
| ------ | ------------------------------ | ---------- | ----------- |
| ESP-01 | Ai-Thinker Technology Co. Ltd. | 1.2.0.0    | 1.5.4.1     |

# Wiring

Here is a wiring example for UART0.

| Raspberry Pi Pico | ESP8266    |
| ----------------- | ---------- |
| 3V3               | VCC, CH_PD |
| GND               | GND        |
| GP0 (UART0 TX)    | RXD        |
| GP1 (UART0 RX)    | TXD        |

![wiring](https://github.com/niklauslee/esp8266-driver/blob/main/images/wiring.png?raw=true)

# Install

```sh
npm install https://github.com/niklauslee/esp8266-driver
```

# Usage

If you wired ESP8266 module to UART0 you can setup simply as below:

```js
require("esp8266-driver")
  .setup()
  .then(() => {
    // ...
  });
```

Otherwise you can setup with an UART instance as below.

```js
var UART = require("uart").UART;
var serial0 = new UART(0, { bufferSize: 4096 });
var esp8266 = require("esp8266-driver");
esp8266.setup(serial0).then(() => {
  // ...
});
```

You can see all AT commands and response in **Terminal** if you pass `debug` parameter as `true`.

```js
require("esp8266-driver")
  .setup(null, { debug: true })
  .then(() => {
    // ...
  });
```

The classes in `wifi`, `net`, `http` builtin modules should be instantiated after `setup()`.

```js
var WiFi = require("wifi").WiFi;
require("esp8266-driver")
  .setup()
  .then(() => {
    var wifi = new WiFi();
    var connectInfo = { ssid: "iptime", password: "12345678" };
    wifi.connect(connectInfo, (err) => {
      // ...
    });
  });
```

We recommend you do not place Wi-Fi SSID and password in the code. Instead, you can enter `WIFI_SSID` and `WIFI_PASSWORD` using [Storage API](https://docs.kaluma.io/api-reference/storage) as below in Terminal.

```
> storage.setItem('WIFI_SSID', 'your_ssid');
> storage.setItem('WIFI_PASSWORD', 'your_password');
```

Then, you can connect Wi-Fi without connection info as below:

```js
var WiFi = require("wifi").WiFi;
require("esp8266-driver")
  .setup()
  .then(() => {
    var wifi = new WiFi();
    wifi.connect((err) => {
      // ...
    });
  });
```

# API

## esp8266.setup([serial[, options]])

- **`serial`** `<UART>` A serial connected to ESP8266 module. If this parameter is omitted, UART0 is used as default. Default: UART0.
- **`options`** `<object>` Options to be passed to internal AT command class.
- **Returns:** `<Promise>`

Initialize ESP8266 module.

# Limitations

## Socket address and port

Socket connection doesn't have `localAddress`, `localPort`, `removeAddress`, `removePort`. The reason is that the info is not provided at the time of connection using AT command. Extra AT command (`AT+CIPSTATUS`) is required to get the info.

> If you need the info necessarily, recommend to use AT command directly.

## Half-close

Half-closing is not supported. Trying to half-close will cause just close.

## Don't support keep-alive

Web browsers uses keep-alive connection by adding `Connection: keep-alive` in HTTP request headers.

# Testing

To run test cases on the board.

```bash
$ kaluma flash ./test.js --bundle --shell
```
