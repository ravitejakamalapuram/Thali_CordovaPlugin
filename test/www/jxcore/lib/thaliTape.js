/*
 Thali unit test implementation of tape. Highly inspired by wrapping-tape, and
 usage is very similar to the wrapping tape:

 var tape = require('thaliTape');

 var test = tape({
 setup: function(t) {
 // will be called after each test has started to setup the test
 // after the next line, the actual test code will be executed
 t.end();
 },
 teardown: function(t) {
 // will be called after each device has ended the test
 // do any final tear down for the test in here
 t.end();
 }
 });
 */

'use strict';

var util = require('util');
var format = util.format;

var assert = require('assert');
var uuid = require('node-uuid');
var uuidValidate = require('uuid-validate');
var tape = require('tape-catch');
var io = require('socket.io-client');
var testUtils = require('./testUtils');
var Promise = require('lie');

process.on('uncaughtException', function (err) {
  testUtils.logMessageToScreen('Uncaught Exception: ' + err);
  console.log(err.stack);
  console.log('****TEST_LOGGER:[PROCESS_ON_EXIT_FAILED]****');
  process.exit(1);
});

process.on('unhandledRejection', function (err, p) {
  testUtils.logMessageToScreen('Uncaught Promise Rejection: ' + err);
  console.trace(err);
  console.log(err.stack);
  console.log('****TEST_LOGGER:[PROCESS_ON_EXIT_FAILED]****');
  process.exit(1);
});

var tests = {};
var allSuccess = true;

var emitWhenConnected = function (socket, name, data) {
  if (socket.connected) {
    data = data || '';
    socket.emit(name, data);
  } else {
    setTimeout(function () {
      emitWhenConnected(socket, name, data);
    }, 1000);
  }
};

// We should remove prefix (uuid.v4) from data.
function getData(dataString) {
  var data = JSON.parse(dataString);
  assert(
    uuidValidate(data.uuid, 4),
    'we should have a valid uuid.v4'
  );

  return data.content;
}

function declareTest(testServer, name, setup, teardown, opts, cb) {

  // test declaration is postponed until we know the order in which
  // the server wants to execute them.

  // Tape executes tests in strict declaration order once the output stream
  // starts to request results so make sure we declare everything up front
  // before asking for the first result

  // Here we declare setup and teardown functions either side of the actual test
  // They'll be executed in declaration order and will be coordinated across
  // devices by the test server emitting events at the appropriate point

  tape('setup', function (t) {
    // Run setup function when the testServer tells us
    var success = true;
    testServer.once('setup_' + name, function (data) {
      emitWhenConnected(
        testServer,
        format('setup_%s_confirmed', name),
        data
      );

      t.on('result', function (res) {
        success = success && res.ok;
      });
      t.once('end', function () {
        if (!success) {
          allSuccess = false;
        }

        emitWhenConnected(
          testServer,
          format('setup_%s_finished', name),
          JSON.stringify({
            'success': success,
            'data': t.data || null
          })
        );
      });
      setup(t);
    });
  });

  tape(name, function (t) {
    var success = true;

    t.on('result', function (res) {
      success = success && res.ok;
    });

    t.once('end', function () {
      emitWhenConnected(
        testServer,
        format('run_%s_finished', name),
        JSON.stringify({
          success: success
        })
      );

      if (!success) {
        allSuccess = false;
      }
    });

    // Run the test (cb) when the server tells us to
    testServer.once('run_' + name, function (data) {
      var parsedData = getData(data);
      emitWhenConnected(
        testServer,
        format('run_%s_confirmed', name),
        data
      );

      t.participants = JSON.parse(parsedData);
      cb(t);
    });
  });

  tape('teardown', function (t) {
    testServer.once('teardown_' + name, function (data) {
      emitWhenConnected(
        testServer,
        format('teardown_%s_confirmed', name),
        data
      );

      var success = true;
      t.on('result', function (res) {
        success = success && res.ok;
      });
      t.once('end', function () {
        if (!success) {
          allSuccess = false;
        }

        emitWhenConnected(
          testServer,
          format('teardown_%s_finished', name),
          JSON.stringify({
            success: success
          })
        );
      });
      teardown(t);
    });
  });
}

// The running number of the test that together with the test name guarantees
// a unique identifier even if there exists multiple tests with same name
var testRunningNumber = 0;
// Flag used to check if we have completed all the tests we should run
var complete = false;
var nextTestOnly = false;
var ignoreRemainingTests = false;

var thaliTape = function (fixture) {
  // Thali_Tape - Adapt tape such that tests are executed when explicitly
  // triggered by a co-ordinating server executing (perhaps) remotely.
  // This enables us to run tests in lock step across a number of devices

  // test([name], [opts], fn)
  var addTest = function (name, opts, fn) {

    // This is the function that declares and performs the test.
    // cb is the test function. We wrap this in setup and

    if (ignoreRemainingTests) {
      return;
    }

    if (!fn) {
      fn = opts;
      opts = null;
    }

    if (nextTestOnly) {
      tests = {
        name: {
          opts: opts,
          fn: fn,
          fixture: fixture
        }
      };
      ignoreRemainingTests = true;
      return;
    }

    testRunningNumber++;
    tests[testRunningNumber + '. ' + name] = {
      opts: opts,
      fn: fn,
      fixture: fixture
    };
  };

  addTest.only = function (name, opts, fn) {
    nextTestOnly = true;
    addTest(name, opts, fn);
  };

  return addTest;
};

thaliTape.uuid = uuid.v4();

var platform =
  typeof jxcore !== 'undefined' && jxcore.utils.OSInfo().isAndroid ?
  'android' :
  'ios';

thaliTape.begin = function (version, hasRequiredHardware, nativeUTFailed) {
  console.log('ThaliTape :: Started ThaliTape');
  var serverOptions = {
    transports: ['websocket']
  };

  var connectionString = 'http://' + require('../server-address') + ':' + 3000 +
  '/';
  console.log('ThaliTape ::  Connecting to ', connectionString);
  var testServer = io(connectionString, serverOptions);

  var firstConnection = true;
  var onConnection = function () {
    if (firstConnection) {
      // Once connected, let the server know who we are and what we do
      testServer.once('schedule', function (data) {
        var parsedData = getData(data);
        emitWhenConnected(
          testServer,
          'schedule_confirmed',
          data
        );

        JSON.parse(parsedData)
        .forEach(function (test) {
          declareTest(
            testServer,
            test,
            tests[test].fixture.setup,
            tests[test].fixture.teardown,
            tests[test].opts,
            tests[test].fn
          );
        });
      });
    }
    firstConnection = false;

    var presentData = {
      os: platform,
      version: version,
      supportedHardware: hasRequiredHardware,
      nativeUTFailed: nativeUTFailed,
      name: testUtils.getName(),
      uuid: thaliTape.uuid,
      type: 'unittest',
      tests: Object.keys(tests)
    };
    emitWhenConnected(testServer, 'present', JSON.stringify(presentData));
  };

  // We are having similar logic in both connect reconnect
  // events, because socket.io seems to behave so that sometimes
  // we get the connect event even if we have been connected before
  // (and sometimes the reconnect event).
  testServer.on('connect_error', function (error) {
    console.log('ThaliTape :: Error when connecting to the test server '
      + error);
    console.log(error.message);
    console.log(error.stack);
    testUtils.logMessageToScreen('Error when connecting to the test server '
      + error);
    onConnection();
  });
  testServer.on('connect_timeout', function () {
    console.log('ThaliTape :: Connection timeout reached when connecting '
      + 'to the test server');
    testUtils.logMessageToScreen('Connection timeout reached when connecting '
      + 'to the test server');
    onConnection();
  });
  testServer.on('connect', function () {
    console.log('ThaliTape :: Connected to the test server');
    testUtils.logMessageToScreen('Connected to the test server');
    onConnection();
  });
  testServer.on('reconnect', function () {
    console.log('ThaliTape :: Reconnected to the test server');
    testUtils.logMessageToScreen('Reconnected to the test server');
    onConnection();
  });

  testServer.once('discard', function (data) {
    emitWhenConnected(testServer, 'discard_confirmed', data);

    // This device not needed, log appropriately so CI doesn't think we've
    // failed
    testUtils.logMessageToScreen('Device discarded as surplus');
    console.log('--= Surplus to requirements =--');
    console.log('****TEST_LOGGER:[PROCESS_ON_EXIT_SUCCESS]****');
  });

  testServer.once('disqualify', function (data) {
    emitWhenConnected(testServer, 'disqualify_confirmed', data);

    testUtils.logMessageToScreen('Device disqualified');
    testUtils.returnsValidNetworkStatus()
    .then(function (validStatus) {
      if (validStatus) {
        console.log('****TEST_LOGGER:[PROCESS_ON_EXIT_SUCCESS]****');
      } else {
        console.log('****TEST_LOGGER:[PROCESS_ON_EXIT_FAILED]****');
      }
    });
  });

  testServer.on('error', function (data) {
    var errData = JSON.parse(data);
    testUtils.logMessageToScreen('Error: ' + data + ' : ' + errData.type +
      ' : ' + errData.data);
  });

  testServer.on('disconnect', function () {
    if (complete) {
      process.exit(0);
    } else {
      // Just log the error since socket.io will try
      // to reconnect.
      testUtils.logMessageToScreen('Disconnected from the test server');
    }
  });

  testServer.once('complete', function (data) {
    emitWhenConnected(testServer, 'complete_confirmed', data);

    testUtils.logMessageToScreen('Tests complete');
    complete = true;
    if (allSuccess) {
      console.log('****TEST_LOGGER:[PROCESS_ON_EXIT_SUCCESS]****');
    } else {
      console.log('****TEST_LOGGER:[PROCESS_ON_EXIT_FAILED]****');
    }
  });

  testServer.once('aborted', function () {
    testUtils.logMessageToScreen('Tests aborted');
    complete = true;
    console.log('****TEST_LOGGER:[PROCESS_ON_EXIT_FAILED]****');
  });

  // Only used for testing purposes..
  thaliTape._testServer = testServer;

  return new Promise(function (resolve, reject) {
    testServer.once('complete', function () {
      if (allSuccess) {
        resolve('Successfully completed');
      } else {
        reject('Completed with errors');
      }
    });
  });
};

var objectToExport;
if (typeof jxcore === 'undefined' ||
    typeof Mobile !== 'undefined') {
  // On mobile, or outside of jxcore (some dev scenarios) we use
  // the server-coordinated thaliTape
  objectToExport = thaliTape;
  objectToExport.coordinated = true;
} else {
  // On desktop we just use simple non-coordinated tape
  objectToExport = require('./simpleTape');
  objectToExport.coordinated = false;
}

module.exports = exports = objectToExport;
