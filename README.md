# api-twitch

> ES6 JS classes for Twitch API requests and chat download

## Installation

```sh
npm install api-twitch --save
```

## Usage

Interact with Twitch's v5 REST API  
  
Main features:
 - High speed concurrent asynchronous download of Twitch chats from VODs  
 - Fetch VOD metadata, download URLs (m3u8) and top clips from a channel.
 - Fetch Twitch channel information, list of VODs, and live status
  
Example setup - Get Stream Statuses
```js
const { TwitchAPI } = require('api-twitch');

let twitchAPI = new TwitchAPI({twitchClientId: "<your twitchClientId>"});

let channelNames = ["stream_name1", "streamer2"];

// Get a hash of channel data to get key elements
let streamInfoHash = await twitchAPI.getDataForChannels(channelNames);

// Create array of promises and use await to block until ALL statuses are retrieved
let allStreamStatuses = await Promise.all(channelNames.map(name => twitchAPI.getStreamStatus(name));

// Order is maintained so we can just loop through channelNames
channelNames.forEach((name, index) => {
  console.log(`[D] TwitchAPI.streamStatus for ${name} is:`, allStreamStatuses[index]);
});
```

## Get list of VODs clips from a channel with metadata, and the VOD chat messages
```js

// After using getDataForChannels to get their channelIds, we can get their VODs
let recentVodList = await twitchAPI.getVods({channelId: streamInfoHash["streamer2"]._id});
let clipData = await this.twitchAPI.getClipData({channelName: "streamer2"});

console.log(`[D] TwitchAPI - recentVodList:`, recentVodList);
console.log(`[D] TwitchAPI - top clips:`, clipData);

let vodId = recentVodList[0]._id.replace(/v/gi, ''); // Get first Vod. get rid of v at start of vod ID
let vodMetadata = await twitchAPI.getVodMetadata(vodId);
let vod_download_urls = await twitchAPI.getVodURLs(vodId); // parse with m3u8-parser, trust me 

// Download chat
let vodChatData = await twitchAPI.getVodChatLogs({
  vodId: vodId,
  start: 0,
  length: vodMetadata.length, // .length is the duration of the full VOD in seconds
  numWorkers: 5, // max num concurrent requests in parallel
});

console.log(`[D] TwitchAPI - vodMetadata:`, vodMetadata);
console.log(`[D] TwitchAPI - vod_download_urls:`, vod_download_urls);
console.log(`[D] TwitchAPI - vodChatData:`, vodChatData); // NOTE: this can be BIIIIIG

// As for downloading and compiling the video data, that's a different module. Let me know if that interests you.
```

## Notes
There are numerous checks for process.env.DEBUG to be defined.  
If set to anything, it will invoke many useful debugging log statements.  

NOTE: Any of these requests can 404 if a VOD or channel is deleted.  
The API requests will return the number 404 in these cases.  
  
## Credits
http://x64projects.tk/
