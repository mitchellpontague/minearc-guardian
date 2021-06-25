var serialport = require('serialport');
const Readline = require('@serialport/parser-readline');
var rpio = require('rpio');
var db = require('./database');

rpio.init({close_on_exit: true});

var mains_pin = 33;
var inverter_pin = 35;

var delay = 10000;
var next = Date.now();

setInterval(poll_database, 10000);
poll_database();

function poll_database() {
  db.getMonitorData(0, function(err, data) {
    if (err) {
      return console.log(err.message);
    }
    exports.history = data;
  });
}

var elv_alarms = {
  'Low Battery Voltage': {state: false, type: 'elv'},
  'No Mains Power': {state: false, type: 'elv'},
};

var elv_data = {
  mains: false,
  inverter: false,
  serial: {
    PID: '',
    V: '',
    VS: '',
    I: '',
    P: '',
    CE: '',
    SOC: '',
    TTG: '',
    Alarm: '',
    Relay: '',
    AR: '',
    BMV: '',
    FW: '',
    H1: '',
    H2: '',
    H3: '',
    H4: '',
    H5: '',
    H6: '',
    H7: '',
    H8: '',
    H9: '',
    H10: '',
    H11: '',
    H12: '',
    H15: '',
    H16: '',
    H17: '',
    H18: ''
  }
};

exports.data = elv_data;
exports.alarms = elv_alarms;

var port = new serialport('/dev/ttyS0', {baudRate: 19200, autoOpen: false});

var battMon = port.pipe(new Readline({delimiter: '\r\n'}));

battMon.on('open', () => {
  console.log('port open. Data rate: ' + battMon.options.baudRate);
});

battMon.on('close', () => {
  console.log('port closed.');
  setTimeout(battMon.open, 1000);
});

battMon.on('error', (error) => {
  console.log('Serial port error: ' + error);
  setTimeout(battMon.open, 1000);
});

battMon.on('data', sendSerialData);

function sendSerialData(data) {
  var v = data.split('\t');

  if (v[0] in elv_data.serial) {
    elv_data.serial[v[0]] = v[1];
  }

  if (v[0] == 'H18' && next <= Date.now() && elv_data.PID != '' &&
      !isNaN((elv_data.serial.V / 1000)) &&
      !isNaN((elv_data.serial.I / 1000))) {
    elv_alarms['Low Battery Voltage'].state = elv_data.serial.Relay == 'ON';
    elv_alarms['No Mains Power'].state = !elv_data.mains;
    next += delay;
    var graph_data = {
      voltage_battery: +((elv_data.serial.V / 1000).toFixed(2)),
      current_battery: +((elv_data.serial.I / 1000).toFixed(2)),
      voltage_mains: elv_data.mains,
      voltage_inverter: elv_data.inverter
    };
    db.addMonitorData(0, graph_data, function(err, success) {
      if (err) return console.log(err.message);
    });
  }
}

setTimeout(() => {
  port.open();
}, 20000);

function pollPins(pin) {
  switch (pin) {
    case mains_pin:
      elv_data.mains = !!rpio.read(pin);
      break;
    case inverter_pin:
      elv_data.inverter = !!rpio.read(pin);
      break;
  }
}

setTimeout(() => {
  rpio.open(mains_pin, rpio.INPUT, rpio.PULL_DOWN);
  rpio.open(inverter_pin, rpio.INPUT, rpio.PULL_DOWN);
  rpio.poll(mains_pin, pollPins);
  rpio.poll(inverter_pin, pollPins);
}, 15000);
