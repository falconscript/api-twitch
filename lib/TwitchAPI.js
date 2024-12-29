"use strict";

const m3u8_MetaParser = require('m3u8-stream-list'),
  TwitchRequest = require("./TwitchRequest");


/**
 * TwitchAPI
 *
 * v5 Twitch API for important calls. twitch_chatlog uses v3 for metadata though!
 */
class TwitchAPI {
  constructor (args) {
    this.twitchClientId = args.twitchClientId
      || console.log(`[!] ${this.constructor.name}.constructor - ERR no twitchClientId! Pass {twitchClientId: "..."}`);
    TwitchRequest.twitchClientId = this.twitchClientId; // for now, whatever. attach to 

    this.MAX_NUM_DOWNLOAD_THREADS = 15; // Max num "threads" (concurrent requests) to use downloading the twitch chat
  }

  async getVodMetadata (vodId) {
    return await new TwitchRequest({
      url: `https://api.twitch.tv/kraken/videos/v${vodId}`,
    }).runAsync();
  }

  async getVodURLs (vodId) {
    // Get a token first... Seems like the only API request that needs one
    let tokenJson = await new TwitchRequest({
      url: `https://api.twitch.tv/api/vods/${vodId.replace(/v/g, '')}/access_token`,
    }).runAsync();

    if (tokenJson == 404) {
      return tokenJson;
    }

    let m3u8_urls_raw_file = await new TwitchRequest({
      // WAS http://usher.twitch.tv BEFORE... got cert issues doing https though
      url: `https://usher.ttvnw.net/vod/${vodId.replace(/v/g, '')}?nauthsig=${tokenJson.sig}&nauth=${tokenJson.token}`,
    }).runAsync();

    if (m3u8_urls_raw_file == 404) {
      return m3u8_urls_raw_file;
    } else if (m3u8_urls_raw_file.indexOf('Manifest is resticted') != -1) {
      return "SUBSCRIBERS_ONLY"; // This video is only available to Subscribers of the channel... Nuts!!
    }

    // Sort by quality - chunked is source apparently
    let vodURLs;
    try {
      vodURLs = m3u8_MetaParser(m3u8_urls_raw_file);
    } catch (e) {
      let error = `[!] ${this.constructor.name}.getVodURLs - ERROR Parsing m3u8 raw file!! e: ${e.toString()}
        raw m3u8_urls data: ${m3u8_urls_raw_file}`;

      console.log(error);
      throw error;
    }

    return vodURLs.sort((a, b) => {
      //var aRes = (parseInt(a.RESOLUTION.split('x')[0]) * parseInt(a.RESOLUTION.split('x')[0]));
      //var bRes = (parseInt(b.RESOLUTION.split('x')[0]) * parseInt(b.RESOLUTION.split('x')[0]));
      return parseInt(b.BANDWIDTH) - parseInt(a.BANDWIDTH);
    });
  }

  // This is the v5 api created once rechat.twitch.tv was apparently deprecated.
  // NOTE that this version REQUIRES the Client-ID whereas the rechat one did not.
  async getVodChatLogs ({vodId, start, length, numWorkers=this.MAX_NUM_DOWNLOAD_THREADS}) {

    return await new Promise((resolve, reject) => {
      // segments downloaded in parallel with this many workers
      let nWorkers = Math.max(1, Math.min(Math.ceil(length / 600), numWorkers)); // 1 to 15 "threads" for each 10 minutes of video
      let results = [];
      let numCompletedWorkers = 0;
      let bailNow = false;
      let timePerWorker = length / nWorkers;

      let processOne = async (workerIndex, numRequestsThisThread=0, cursor=null) => {
        let workerStartTime = Math.floor(start + (timePerWorker * workerIndex)); // .floor not needed, seems nice though?
        let timeBoundary = workerStartTime + timePerWorker;

        process.env.DEBUG && console.log(`[D] ${this.constructor.name}.getVodChatLogs - worker ${workerIndex}/${nWorkers} action START: ${workerStartTime}`);

        // Download segment
        let data = await new TwitchRequest({
          name: "getVodChatLogsRequest",
          url: `https://api.twitch.tv/v5/videos/${vodId}/comments?`
            + (numRequestsThisThread === 0 ? `content_offset_seconds=${workerStartTime}` : `cursor=${cursor}`),
        }).runAsync();

        if (bailNow) {
          return;
        } else if (data === 404) {
          // Video probably deleted
          console.log(`[D] ${this.constructor.name}.getVodChatLogs hit 404 on request ${workerIndex} for ${vodId}`);
          bailNow = true; // stop future request attempts
          return resolve(404);
        }

        // Twitch sends {comments: [array of messages], _next: "ajkweogapowgkjaewogkwe" }
        /* a twitch comment in this API has this format:
          channel_id:"36029255"
          commenter: {
            bio:null,
            created_at:"2017-06-16T19:38:38.96528Z",
            display_name:"d1askonee",
            logo:null,
            name:"d1askonee",
            type:"user",
            updated_at:"2017-10-13T21:31:20.562334Z",
            _id:"160432092" },
          content_id:"176820288"
          content_offset_seconds:0
          content_type:"video"
          created_at:"2017-09-23T14:37:56.904346606Z"
          message:{body: "LUL", emoticons: [{_id: "425618", begin: 0, end: 2}],…}
          more_replies:false
          source:"comment"
          state:"published"
          updated_at:"2017-09-23T14:37:56.904346606Z"
          _id:"7SrDbW8E5xQC9g" */

        data.comments.sort((a, b) => a.content_offset_seconds - b.content_offset_seconds);

        let lastCommentTime = data.comments[data.comments.length - 1].content_offset_seconds;

        results[workerIndex].push(data.comments); // make an array of arrays

        process.env.DEBUG && console.log(`[D] TwitchAPI.getVodChatLogs - worker ${workerIndex} action done. LEN=${data && data.comments.length} lastTime=${lastCommentTime} next=${data._next},`);

        if ((data.comments.length > 0 && lastCommentTime >= timeBoundary) || !data._next) {
          // Done with this section of comments. Check if all workers done
          if (++numCompletedWorkers == nWorkers) {
            // done, combine all results and remove duplicates! else wait for other workers
            let seen = {};
            let filteredvalues = [].concat.apply([], [].concat.apply([], results)).filter(msg => {
              let key = msg.content_offset_seconds + '_' + msg.message.body;
              return seen.hasOwnProperty(key) ? false : (seen[key] = true);
            });

            process.env.DEBUG && console.log(`[D] TwitchAPI.getVodChatLogs DONE. Num msgs: ${filteredvalues.length}`);
            process.env.DEBUG && console.log(`[D] TwitchAPI.getVodChatLogs DONE. First message:`, filteredvalues[0]);
            return resolve(filteredvalues); // merge array of arrays
          } else {
            process.env.DEBUG && console.log(`[D] ${numCompletedWorkers}/${nWorkers} workers done, waiting on others`);
          }
        } else {
          // Get next array of comments for this boundary
          return process.nextTick(() => processOne(workerIndex, numRequestsThisThread + 1, data._next));
        }
      };

      // Kick off workers
      for (let k = 0; k < nWorkers; k++) {
        results.push([]); // add array for this index to put comments into
        ((k) => {
          process.nextTick(() => { processOne(k); });
        })(k);
      }

    });
  }

  // DEPRECATED - Twitch updated and no longer supports the "rechat" URLs
  /* example rechat chat message JSON:
  { type: 'rechat-message',
    id: 'chat-19-2017:AVwHZbAc6UC32n0BjFRn',
    attributes:
    { command: '',
      room: 'vgbootcamp',

      timestamp: 1494772707641,
      'video-offset': 19641,
      deleted: false,
      message: 'OwO',
      from: 'opuc',
      tags:
        { badges: 'moderator/1,bits/1',
          color: '#FFB3FC',
          'display-name': 'Opuc',
          emotes: null,
          id: 'e62b2721-2d0f-45bd-aa0f-728c7658e361',
          mod: true,
          'room-id': '9846758',
          'sent-ts': '1494772722452',
          subscriber: false,
          'tmi-sent-ts': '1494772722082',
          turbo: false,
          'user-id': '59087902',
          'user-type': 'mod' },
      color: '#FFB3FC' },
    links: { self: '/rechat-message/chat-19-2017:AVwHZbAc6UC32n0BjFRn' } }
    */
  /*async DEPR_getVodChatLogs_v3 (vodId, start, length) {
    return await new Promise((resolve, reject) => {
      // The fragments cover 30 seconds each.
      let timestamps = [ start ];
      for (let i = 30; i < length; i += 30) {
        timestamps.push(start+i);
      }

      // I'm sorry this parallelization is so weird. I wrote it in a stange place
      let nWorkers = 10; // segments downloaded in parallel with this many workers
      let results = timestamps.map((ts, i) => { return -1; });
      let i = -1;
      let isCompleted = false;
      let numDone = 0;

      let processOne = () => {
        if (i >= (timestamps.length - 1)) return; // overflow protection

        let workingIndex = ++i;

        let curTimestamp = timestamps[workingIndex]; // i is only used once here

        // Download segment
        new TwitchRequest({
          url: "https://rechat.twitch.tv/rechat-messages?start=" + curTimestamp + "&video_id=v" + vodId,
          callback: (data) => {
            if (isCompleted) {
              return; // overflow protection
            }
            // Video probably deleted
            if (data === 404) {
              console.log(`[D] TwitchAPI.getVodChatLogs hit 404 on request ${workingIndex} for ${vodId}`);
              isCompleted = true; // stop future request attempts            
              return resolve(404);
            }

            // Twitch sends {data: [array of messages], meta: {next: null} }
            results[workingIndex] = data.data; 
            
            if (++numDone == timestamps.length) {
              isCompleted = true;
              return resolve([].concat.apply([], results)); // merge array of arrays
            } else {
              return process.nextTick(processOne); // next
            }
          }
        }).run();
      };

      // Kick off workers
      for (let k = 0; k < nWorkers && k < timestamps.length; k++) {
        processOne(); // process.nextTick ?
      }

    });
  }

  // DEPRECATED - Twitch updated and no longer supports the "rechat" URLs
  async DEPR_getVodChatLogs_via_twitch_chatlog (vodId) {
    return await twitch_chatlog.getChatlog({
      vodId: vodId,
      length: 0, // Get the entire video
      clientId: this.twitchClientId,
      requests: 10, // Num to send at once
      //progress: true, // show a bar
    }).catch(e => {
      // StatusCodeError: 404 - {"errors":[{"status":404,"detail":"No chats for this Video"}]}
      if (e.message.toString().indexOf('404 - ') != -1) {
        // Video probably deleted (or marked private if that's possible)
        console.log(`[-] TwitchAPI.twitch_chatlog.getChatlog - 404 for video ${vodId}`);
        //return callback(404);
      } else {
        // Unforeseen error
        console.log(`[!] TwitchAPI.twitch_chatlog.getChatlog - ERR:`, e);
        throw e;
      }
    });
  }*/

  // getVods - Get VOD metadatas for VODs of a channel with pagination, basically
  async getVods ({
    channelId=null,
    numVodsIncrement=10, // limit
    offset=0,
  }) { // defaults .offset to 0 if not provided
    // pass cutoffDateTime to only include videos NEWER than this datetime
    // https://dev.twitch.tv/docs/v5/reference/channels/#get-channel-videos
    return await new TwitchRequest({
      url: `https://api.twitch.tv/kraken/channels/${channelId}/videos`
        + `?limit=${numVodsIncrement}&broadcast_type=archive,upload&sort=time&offset=${offset || 0}`,
    }).runAsync();
  }

  async getStreamStatus (channelId) {
    // https://dev.twitch.tv/docs/v5/reference/streams/
    return await new TwitchRequest({
      url: `https://api.twitch.tv/kraken/streams/${channelId}`,
    }).runAsync();
  }

  // Pass array of channel names. API requires them to be in all lower case
  // @returns a hash with key being channel name and value being the channel data object
  async getDataForChannels (channelNameArr) {
    if (!channelNameArr.length) {
      throw "[!] TwitchAPI.getDataForChannels ERR - No channel names specified!";
    }

    channelNameArr = channelNameArr.map(name => name.toLowerCase()); // must be lower case for twitch api

    // https://dev.twitch.tv/docs/v5/guides/using-the-twitch-api/
    let json = await new TwitchRequest({
      url: `https://api.twitch.tv/kraken/users?login=${channelNameArr.join(',')}`,
      name: "getDataForChannels",
    }).runAsync();

    if (json == 404) {
      return json;
    }

    let streamInfoHash = {};
    json.users.forEach(info => streamInfoHash[info.name] = info);

    return streamInfoHash;
  }

  async getClipData ({channelName, numToGet=10}) {
    // https://dev.twitch.tv/docs/v5/reference/clips/
    
    return await new TwitchRequest({
      url: `https://api.twitch.tv/kraken/clips/top?limit=${numToGet}&channel=${channelName}`,
    }).runAsync();
  }
};

module.exports = {
  TwitchAPI: TwitchAPI,
  TwitchRequest: TwitchRequest,
};
