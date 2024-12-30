"use strict";

const util = require('util'),
  m3u8_MetaParser = require('m3u8-stream-list'),
  TwitchRequest = require("./TwitchRequest");

let fullTreePrint = (myObject) => util.inspect(myObject, {showHidden: false, depth: null, colors: true});

/**
 * TwitchAPI
 *
 * Helix Twitch API for important calls. twitch_chatlog uses v3 for metadata though!
 */
class TwitchAPI {
  constructor (args={}) {
    this.twitchClientId = args.twitchClientId
      || console.log(`[!] ${this.constructor.name}.constructor - ERR no twitchClientId! Pass {twitchClientId: "..."}`);
    TwitchRequest.twitchClientId = this.twitchClientId; // for now, whatever. attach to the class

    this.twitchClientSecret = args.twitchClientSecret
      || console.log(`[!] ${this.constructor.name}.constructor - ERR no twitchClientSecret! Pass {twitchClientSecret: "..."}`);
    TwitchRequest.twitchClientSecret = this.twitchClientSecret; // for now, whatever. attach to the class

    this.tokenJson = null;

    this.MAX_NUM_DOWNLOAD_THREADS = 15; // Max num "threads" (concurrent requests) to use downloading the twitch chat
  }


/**
 * TEST_ALL_FUNCTIONALITY
 * @param {string} [testUsername="<twitch username>"] 
 * @return Nothing - outputs a LOT to the screen to verify requests work as expected
 * @description - Run the test.js file to verify API IS STILL GOOD with this: $ node test.js
 */
  async TEST_ALL_FUNCTIONALITY (testUsername=process.env.TEST_USERNAME && process.env.TEST_USERNAME.toLowerCase() || "mang0") {
    console.log(`\n[T] ${this.constructor.name} - NOW TESTING FUNCTIONALITY OF HELIX API...\n`);
    console.log(`[T] USING CREDS: twitchClientId=${this.twitchClientId} AND twitchClientSecret=${this.twitchClientSecret}\n`);

    console.log(`[T] STARTING FOR TESTUSERNAME "${testUsername}":`);

    let streamInfoHash = await this.getInfoForUsersByLoginName([ testUsername ]);
    console.log(`[T] getInfoForUsersByLoginName FOR TESTUSER "${testUsername}":`, fullTreePrint(streamInfoHash));

    let testUserId = streamInfoHash[testUsername].id;
    let userInfo = await this.getInfoForUsersById(testUserId);
    console.log(`[T] getInfoForUsersById FOR TESTUSER ID "${testUserId}":`, fullTreePrint(userInfo));

    let streamStatusById = await this.getStreamStatusById(streamInfoHash[testUsername].id);
    console.log(`[T] getStreamStatusById FOR TESTUSER ID "${streamInfoHash[testUsername].id}":`, fullTreePrint(streamStatusById));
    let streamStatusByLogin = await this.getStreamStatusByLoginName(testUsername);
    console.log(`[T] getStreamStatusByLoginName FOR TESTUSER "${testUsername}":`, fullTreePrint(streamStatusByLogin));

    let channelVideos = await this.getVods({channelName: testUsername});
    console.log(`[T] getVods RECENT VIDEOS FOR TESTUSER "${testUsername}":`, channelVideos);
    if (channelVideos.length) {
      let firstVideo = channelVideos[0].node;
      console.log(`[T] getVods firstVideo: FOR TESTUSER "${testUsername}":`, fullTreePrint(firstVideo));

      let firstVideoAgain = await this.getVodMetadataById(firstVideo.id);
      console.log(`[T] getVodMetadataById sameVideo: FOR TESTUSER "${testUsername}":`, fullTreePrint(firstVideoAgain));
    }

    let clipData = await this.getClipData({userId: testUserId, numToGet: 10});
    console.log(`[T] getClipData FOR TESTUSER "${testUsername}". Numclips:${clipData?.data?.length} FIRST CLIP:`, fullTreePrint(clipData?.data[0]));
    
    // Features like VODURLs and chat are not available in the Helix API.
    
    console.log(`\n[T] ${this.constructor.name} TESTING COMPLETE.\n\n`);
  }

  /**
   * GET an access token. Helix API version
   * @docs https://dev.twitch.tv/docs/api/get-started/
   * @return Token object in form of: {
      "access_token": "asdfasdfasdfasdfasdfasdfasdfa",
      "expires_in": 5011271,
      "token_type": "bearer"
    }
   */ 
  async _getAccessToken () {
    let tokenJson = await new TwitchRequest({
      url: `https://id.twitch.tv/oauth2/token`,
      method: "POST",
      json: {
        client_id: this.twitchClientId,
        client_secret: this.twitchClientSecret,
        grant_type: "client_credentials",
      },
      //noMultipartHeader: true,
      name: "_getAccessToken",
    }).runAsync();

    // Log warning if bad json
    if (!tokenJson || !tokenJson.access_token) {
      console.log(`[!] TwitchAPI._getAccessToken ERR - REQUEST WORKED BUT INVALID TOKEN RECEIVED:`, tokenJson);
    }

    process.env.DEBUG && console.log(`[D] _getAccessToken - Access token attained: `, tokenJson);

    return tokenJson;
  }

  async _ensureValidAccessToken () {
    if (!this.tokenJson || !this.tokenJson.access_token) {
      this.tokenJson = await this._getAccessToken();

      // Set onto the TwitchRequest class so that all requests will use it
      TwitchRequest.tokenJson = this.tokenJson; // for now, whatever. attach to the class
    }

    return this.tokenJson;
  }

  async getInfoForUsersByLoginName (loginNameArr) { return await this.getInfoForUsersById(loginNameArr, "login"); }

  /**
   * getInfoForUsers
   * @param {String|Number|Array} idList - Pass array of channel names. API requires them to be in all lower case
   * @returns streamInfoHash - a hash with key being channel name and value being the channel data object
   * @docs https://dev.twitch.tv/docs/api/reference/#get-channel-information
   */
  async getInfoForUsersById (idList=[], queryType="id" || "login") {
    await this._ensureValidAccessToken();

    if (["id", "login"].indexOf(queryType) == -1) {
      throw `[!] ${this.constructor.name}.getInfoForUsersById ERR - queryType MUST be one of the supported values.`;
    } else if (!idList) {
      throw `[!] ${this.constructor.name}.getInfoForUsersById ERR - No user ${queryType}s specified!`;
    } else if (typeof(idList) === "string" || typeof(idList) === "number") {
      idList = [ idList ]; // if a string or number was passed in, convert it to an array for the API format.
    }

    idList = idList.map(name => name.toLowerCase()); // must be lower case for twitch api

    // For multiple users, add multiple 'broadcaster_id' variables in query parameter.
    let json = await new TwitchRequest({
      url: `https://api.twitch.tv/helix/users?${queryType}=${idList.join(`&${queryType}=`)}`,
      name: `getInfoForUsersBy_${queryType}`,
    }).runAsync();

    if (json == 404) {
      return json;
    }

    let streamInfoHash = {};
    json.data.forEach(info => streamInfoHash[info.login] = info);

    return streamInfoHash;
  }

  /**
   * getStreamStatus
   * @param userId - Search with either channelId or login_name of a twitch user
   * @param searchByNameInsteadOfById - Boolean to toggle between channelId or userId.
   * @returns {Array} Each element is the stream details. and will be EMPTY for OFFLINE users. (weird yes)
   * @docs https://dev.twitch.tv/docs/api/reference/#get-streams
   */
  async getStreamStatusById (identifier) { return await this._getStreamStatus(identifier, "user_id") }
  async getStreamStatusByLoginName (identifier) { return await this._getStreamStatus(identifier, "user_login") }
  async _getStreamStatus (identifier, query_type="user_id" || "user_login") {
    await this._ensureValidAccessToken();

    if (!(identifier instanceof Array) && typeof(identifier) !== "number" && typeof(identifier) !== "string") {
      throw "[!] TwitchAPI.getStreamStatus ERR - videoIDs must be an Array, String, or Number!!";
    } else if (!(identifier instanceof Array)) { // is good, is string or number
      identifier = [ identifier ]; // wrap in array for the API user, must be for below
    }

    // basically append "user_id=" to each and put & between each element. Luckily .join DOESN'T put one at end
    let searchString = identifier.map(i => query_type + "=" + i).join("&");

    let json = await new TwitchRequest({
      url: `https://api.twitch.tv/helix/streams?${searchString}`,
      name: `getStreamStatusBy_${query_type}`,
    }).runAsync();

    return json.data; // json.pagination does offer a cursor sometimes, but not supported
  }


  async getVodMetadataById (vodId) { return await this.getVods({videoIDs: vodId}); }

  /**
   * getVods - MONSTER function
   * @param options - Get VOD metadatas for VODs of a channel with pagination, basically
   * @return { data: [...videodetailobjects], {pagination: {cursor: cursorValue} }, }
   * @docs https://dev.twitch.tv/docs/api/reference/#get-videos
   */
  async getVods ({
    channelId=null,
    channelName=null,
    videoIDs=null,
    numVodsIncrement=20, /* first */ // from 1-100 how many per page (weird that they use "first", I know)
    cursorForAfter='',
    cursorForBefore='',
    type="archive", // can be all, archive, highlight, upload
    sort="time", // can be time, trending, views
    period="all", // can be all, day, week, month
  }) {
    // fetch channelName if channelId was provided and set for them for below. channelName does NOT override channelId
    if (channelName && !channelId) {
      let results = await this.getInfoForUsersByLoginName(channelName);
      if (!results[channelName]) {
        console.log(`[!] ${this.constructor.name}.getVods WARNING: search for ${channelName} resulted in 0 user IDs:`, results)
        return null;
      } else {
        channelId = results[channelName].id;
      }
    }
    
    // validate user input
    if (channelId && videoIDs) {
      throw "[!] TwitchAPI.getVods ERR - cannot pass both videoIDs and channelId!";
    } else if (!channelId && !videoIDs) {
      throw "[!] TwitchAPI.getVods ERR - No channelId/videoIDs specified!";
    } else if (videoIDs) {
      if (!(videoIDs instanceof Array) && typeof(videoIDs) !== "number" && typeof(videoIDs) !== "string") {
        throw "[!] TwitchAPI.getVods ERR - videoIDs must be an Array, String/Number!!";
      } else if (!(videoIDs instanceof Array)) { // is good, is string or number
        videoIDs = [ videoIDs ]; // wrap in array for the API user, must be for below
      }
    } else { // we are using channelId
      if (!parseInt(channelId)) {
        throw "[!] TwitchAPI.getVods ERR - channelId must be a numerical channel ID for one channel!!";
      } // else is good, is number
    }

    // pass cutoffDateTime to only include videos NEWER than this datetime
    await this._ensureValidAccessToken();
    
    let SEARCH_IDs = "";
    if (channelId) {
      SEARCH_IDs = `user_id=${channelId}`;
    } else if (!videoIDs.length) {
      throw "[!] TwitchAPI.getVods ERR - No videoIDs passed (array was empty).";
    } else {
      SEARCH_IDs = `id=${videoIDs.join('&id=')}`;
    }

    // "To specify multiple video IDs, repeat the id parameter. For example, id=123&id=456&id=789."
    return await new TwitchRequest({
      url: `https://api.twitch.tv/helix/videos?${SEARCH_IDs}`
        + `&first=${numVodsIncrement}`
        + `&type=${type}`
        + `&sort=${sort}`
        + `&period=${period}`
        + `&before=${cursorForBefore}`
        + `&after=${cursorForAfter}`,
      name: "getVods",
    }).runAsync();
  }


  async getVODURLs (vodId) { throw `[!] ${this.constructor.name}.getVODURLs UNSUPPORTED by helix API. `;}

  // NON-FUNCTIONAL FOR HELIX. WILL HAVE TO FIND ANOTHER WAY.
  async _v5_DEPRECATED_getVODURLs (vodId) {
    await this._ensureValidAccessToken();

    // Get a token first... Seems like the only API request that needs one
    let tokenJson = await new TwitchRequest({
      url: `https://api.twitch.tv/api/vods/${vodId}/access_token`,
    }).runAsync();

    if (tokenJson == 404) {
      return tokenJson;
    }

    let m3u8_urls_raw_file = await new TwitchRequest({
      // WAS http://usher.twitch.tv BEFORE... got cert issues doing https though
      url: `https://usher.ttvnw.net/vod/${vodId}?nauthsig=${tokenJson.sig}&nauth=${tokenJson.token}`,
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
      let error = `[!] ${this.constructor.name}.getVODURLs - ERROR Parsing m3u8 raw file!! e: ${e.toString()}
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

  // NON-FUNCTIONAL FOR HELIX. WILL HAVE TO FIND ANOTHER WAY.
  // This is the v5 api created once rechat.twitch.tv was apparently deprecated.
  // NOTE that this version REQUIRES the Client-ID whereas the rechat one did not.
  async _v5_DEPRECATED_getVodChatLogs ({vodId, start, length, numWorkers=this.MAX_NUM_DOWNLOAD_THREADS}) {

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


  /**
   * getClipData
   * @param user_id - id of the user for the clips
   * @returns Clips
   * @docs https://dev.twitch.tv/docs/api/reference/#get-clips
   */
  async getClipData ({
    userId=null,
    //loginName=null, // NOT SUPPORTED. Get the userName with getinfo first. Just how they did it.
    //gameName=null, // NOT SUPPORTED. Get the game ID first. Just how they did it.
    gameId=null,
    numToGet=10,
  }) {
  await this._ensureValidAccessToken();

    let searchQuery = "";

    if (gameId && userId) {
      throw `[!] ${this.constructor.name}.getClipData ERR! CANNOT SUPPLY BOTH userId AND gameId`;
    } else if (gameId) {
      searchQuery = `game_id=${gameId}`;
    } else if (userId) {
      searchQuery = `broadcaster_id=${userId}`;
    } else {
      throw `[!] ${this.constructor.name}.getClipData ERR! MUST SUPPLY EITHER userId OR gameId`;
    }
    
    
    return await new TwitchRequest({
      url: `https://api.twitch.tv/helix/clips?first=${numToGet}&${searchQuery}`,
    }).runAsync();
  }
};

module.exports = {
  TwitchAPI: TwitchAPI,
  TwitchRequest: TwitchRequest,
};
