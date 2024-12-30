# api-twitch

> Twitch GQL and Helix API classes for node API requests and chat download

## Installation

```sh
npm install api-twitch --save
```

## Introduction

This module supports TWO Twitch APIs:
 - Twitch GQL API (Graph Query Language)
 - Twitch Helix API

  
## Main features:
 - Fetch Twitch user/channel information, list of videos, and live status
 - Fetch video metadata, download URLs (m3u8) and top clips from a channel.
 - High speed concurrent asynchronous download of Twitch chats from VODs (videos). (GQL Only)  
  
### Usage
Choose between the below two code sections to decide between the Helix or GQL API.  

The function signatures are very nearly the same, it's easy to switch.  

## Twitch Helix API
> Get User Info, Stream Statuses, Videos, and Clips  

Here are some basic examples (Both Helix and GQL APIs supported for these calls).  

This code below can be copied, pasted, and run in node from a directory this module is installed.  

Edit the clientID and secret to match your own.  
```js
async function main () {
  const { TwitchAPI } = require('api-twitch');

  let twitchAPI = new TwitchAPI({
    twitchClientId: "<your_twitchClientId>",
    twitchClientSecret: "<your_twitchClientSecret>",
  });

  let channelNames = ["mang0", "streamer2"];

  // Get a hash of channel data to get info about users/streamers
  let streamInfoHash = await twitchAPI.getInfoForUsersByLoginName(channelNames);

  let allStreamStatuses = await twitchAPI.getStreamStatusByLoginName(channelNames);

  console.log(`[D] TwitchAPI - streamInfoHash:`, streamInfoHash);
  console.log(`[D] TwitchAPI - allStreamStatuses:`, allStreamStatuses);

  let aTwitchUserId = streamInfoHash["mang0"].id;

  // After using getInfoForUsersByLoginName to get their userIds, we can get their VODs and clips
  let recentVodList = await twitchAPI.getVods({channelId: aTwitchUserId});
  let clipData = await twitchAPI.getClipData({userId: aTwitchUserId});

  console.log(`[D] TwitchAPI - recentVodList:`, recentVodList);
  console.log(`[D] TwitchAPI - clipData:`, clipData);
}

main();
```


## What is Twitch GQL?
> The Twitch "Graph Query Language" (GQL) API has all functionality Helix has and MORE.  

But it might not last forever. With it, access video download URLs and chat data.  

The `test.js` file in this module has great starter code.  
Run ALL the API functions, verify functionality, with this:  
```sh
 # View Help/Instructions 
 $ node node_modules/api-twitch/test.js --help
 
 # Run tests for Twitch GQL API
 $ node node_modules/api-twitch/test.js --gql 

 # Run tests for Twitch Helix API 
 $ twitchClientId="..." twitchClientSecret="..." TEST_USERNAME="Mang0" node node_modules/api-twitch/test.js --helix 
```

## Twitch GQL API
> This is sample test code RIPPED straight from `TEST_ALL_FUNCTIONALITY` in `./lib/TwitchAPI_GQL.js`.  

Reference this code from there, and also the code of `test.js` to understand how to TEST, RUN, and USE this API.  

This code below can be copied, pasted, and run in node from a directory this module is installed.  
```js
async function main () {
  const { TwitchAPI_GQL } = require("api-twitch");

  // helper print function:
  let fullTreePrint = (myObject) => util.inspect(myObject, {showHidden: false, depth: null, colors: true});

  let gql_api = new TwitchAPI_GQL();
  gql_api.TEST_ALL_FUNCTIONALITY(); // Runs all the code below:


  let testUsername = process.env.TEST_USERNAME && process.env.TEST_USERNAME.toLowerCase() || "mang0";

  console.log(`\n[T] gql_api - NOW TESTING FUNCTIONALITY OF GQL API...\n`);

  console.log(`[T] STARTING FOR TESTUSERNAME "${testUsername}":`);

  let streamInfoHash = await gql_api.getInfoForUsersByLoginName([ testUsername ]);
  console.log(`[T] getInfoForUsersByLoginName FOR TESTUSER "${testUsername}":`, fullTreePrint(streamInfoHash));

  let testUserId = streamInfoHash[testUsername].id;
  let userInfo = await gql_api.getInfoForUsersById(testUserId);
  console.log(`[T] getInfoForUsersById FOR TESTUSER ID "${testUserId}":`, fullTreePrint(userInfo));

  let streamStatusById = await gql_api.getStreamStatusById(streamInfoHash[testUsername].id);
  console.log(`[T] getStreamStatusById FOR TESTUSER ID "${streamInfoHash[testUsername].id}":`, fullTreePrint(streamStatusById));
  let streamStatusByLogin = await gql_api.getStreamStatusByLoginName(testUsername);
  console.log(`[T] getStreamStatusByLoginName FOR TESTUSER "${testUsername}":`, fullTreePrint(streamStatusByLogin));

  let channelVideos = await gql_api.getVods({channelName: testUsername});
  console.log(`[T] getVods RECENT VIDEOS FOR TESTUSER "${testUsername}": ${channelVideos.length} VIDEOS FOUND.`);

  // test clip calls
  let userDataWithClips = await gql_api.getClipData({loginName: testUsername, numToGet: 10});
  let userClips = userDataWithClips[testUsername]?.clips?.edges?.map(el => el.node);
  console.log(`[T] getClipData FOR TESTUSER "${testUsername}". Numclips:${userClips?.length} FIRST CLIP:`, fullTreePrint(userClips[0]));

  let gameName = "League of Legends";
  let gameClipInfo = await gql_api.getClipData({gameName: gameName, numToGet: 5});
  let [gameClips, gameVideos] = [ gameClipInfo?.clips?.edges, gameClipInfo?.videos?.edges ];
  console.log(`[T] getClipData FOR GAME "${gameName}". Numclips:${gameClips.length} FIRST CLIP:`, fullTreePrint(gameClips[0]));
  console.log(`[T] getClipData FOR GAME "${gameName}". NumVideos:${gameVideos.length} FIRST VIDEO:`, fullTreePrint(gameVideos[0]));

  if (!channelVideos.length) {
    console.log(`[T] WARNING!! NO VIDEOS WERE FOUND, CANNOT TEST VIDEO TOKEN/VODURLs/COMMENT CHAT DOWNLOAD APIs!!`);
  } else {
    // We have videos! test video stuff
    let firstVideo = channelVideos[0].node;
    console.log(`[T] getVods firstVideo: FOR TESTUSER "${testUsername}":`, fullTreePrint(firstVideo));

    let firstVideoAgain = await gql_api.getVodMetadataById(firstVideo.id);
    console.log(`[T] getVodMetadataById sameVideo: FOR TESTUSER "${testUsername}":`, fullTreePrint(firstVideoAgain));

    let viewingTokenJson = await gql_api.getVODViewingTokenGQL(firstVideo.id);
    console.log(`[T] getVODViewingTokenGQL TOKEN FOR firstVideo FOR TESTUSER "${testUsername}":`, fullTreePrint(viewingTokenJson));


    let vodURLs = await gql_api.getVODURLs(firstVideo.id, viewingTokenJson.token, viewingTokenJson.sig);
    console.log(`[T] getVODURLs firstVideo FOR TESTUSER "${testUsername}":`, fullTreePrint(vodURLs));
    

    let firstCommentSet = await gql_api.getCommentsFromVideoPartial(firstVideo.id);
    console.log(`[T] getCommentsFromVideoPartial: FIRST SECTION: (${firstCommentSet.length} comments downloaded)`);
    console.log(`[T] getCommentsFromVideoPartial: FIRST 3 COMMENTS OF SECTION:`, fullTreePrint(firstCommentSet.slice(0, 3)));

    // Get full video's chat log
    let fullVODChatlog = await gql_api.getVodChatLogs({
      vodId: firstVideo.id,
      start: 0,
      length: firstVideo.lengthSeconds, // time in seconds to get chat messages for. MUST SUPPLY.
      doReformatTheChatLog: false, // We will call reformat ourselves AFTER to disclude original message stuff
    });

    fullVODChatlog = gql_api.reformatChatLog({chatLog: fullVODChatlog, includeOriginalMessage: false});
    let results = gql_api.performRegexFilteringOfChatLog({chatLog: fullVODChatlog}); // requires reformat

    console.log(
      `[T] getVodChatLogs: FULL CHATLOG retrieved.`,
      `\n - Total messages count: ${fullVODChatlog.length}.`,
      `\n - Total messages count after filtering: ${results.cleanedChatLog.length}`,
      `\n - Total messages count FILTERED OUT: ${results.removedMessages.length}`,
      `\n[T] FIRST 5 COMMENTS OF FILTERED CHATLOG: ${fullTreePrint(results.cleanedChatLog.slice(0, 5))}`,
      `\n[T] FIRST 5 COMMENTS REMOVED BY FILTER: ${fullTreePrint(results.removedMessages.slice(0, 5))}`
    );
  }

  console.log(`\n[T] gql_api TESTING COMPLETE.\n\n`);
}

main();
```

# Notes
There are numerous checks for process.env.DEBUG to be defined.  
If set to anything, it will invoke many useful debugging log statements.  

NOTE: Any of these requests can 404 if a VOD or channel is deleted.  
The API requests will return the number 404 in these cases.  

  
# Credits
http://falconscript.com/
