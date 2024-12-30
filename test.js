"use strict";



/**
 * TEST TWITCH GQL API
 */
function testGQLAPI () {
  const { TwitchAPI_GQL, TwitchRequest_GQL } = require("./lib/TwitchAPI_GQL");

  let gql_api = new TwitchAPI_GQL();
  gql_api.TEST_ALL_FUNCTIONALITY();
}


/**
 * TEST TWITCH HELIX API
 */
function testHelixAPI (twitchClientId, twitchClientSecret) {
  const { TwitchAPI, TwitchRequest } = require("./lib/TwitchAPI");

  let helixapi = new TwitchAPI({
    twitchClientId: twitchClientId,
    twitchClientSecret: twitchClientSecret,
  });
  
  helixapi.TEST_ALL_FUNCTIONALITY();
}

function getMyScriptName () {
  let fullname = (process.argv[1] || process.argv[0]);
  if (fullname.indexOf('/') != -1) {
    return fullname.split('/').pop();
  } else if (fullname.indexOf('\\') != -1) {
    return fullname.split('\\').pop();
  } else {
    return fullname;
  }
}

function printHelpMessage () {
  console.log(
`\n $ ${getMyScriptName()} - Use this command to test the APIs. Run with available options:
    -h/--help  : Print this message.
    --helix    : Test Helix API. Essentially just runs new TwitchAPI.TEST_ALL_FUNCTIONALITY();
    --gql      : Test GQL API. Essentially just rusn new TwitchAPI_GQL.TEST_ALL_FUNCTIONALITY();
    

*** HELIX API NOTE:
   * Using Helix API REQUIRES Twitch client_id and client_secret. Get those from https://dev.twitch.tv/console
   * These MUST be set as environment variables as shown in the examples below specifically for the Helix API.

Example Usage: 
  $  twitchClientId="your_client_id" twitchClientSecret="your_twitch_secret"  node ${getMyScriptName()} --helix    # Test Helix API
  $  node ${getMyScriptName()} --gql    # Test GQL API

Can also set environment variable that will be used for the tests:
  $ export TEST_USERNAME="a_twitch_username"; node ${getMyScriptName()} --gql
`);
}

// Runs on execution of script
function main () {
  // print help if -h or --help or no args
  if (process.argv.length < 3 || process.argv.includes("-h") || process.argv.includes("--help")) {
    return printHelpMessage();
  }
  
  // allow testing of both APIs in same execution
  if (process.argv.includes("--gql")) {
    testGQLAPI();
  }

  if (process.argv.includes("--helix")) {
    let twitchClientId = process.env.twitchClientId;
    let twitchClientSecret = process.env.twitchClientSecret;
    
    if (!twitchClientId) {
      console.log("[!] MUST RUN WITH ENVIRONMENT VARIABLE SET NAMED twitchClientId. Printing help message.\n\n" );
      return printHelpMessage();
    } else if (!twitchClientSecret) {
      console.log("[!] MUST RUN WITH ENVIRONMENT VARIABLE SET NAMED twitchClientSecret. Printing help message.\n\n" );
      return printHelpMessage();
    }

    testHelixAPI(twitchClientId, twitchClientSecret);
  }
}

// Execute main
main();
