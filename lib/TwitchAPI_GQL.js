"use strict";

const util = require('util'),
  m3u8_MetaParser = require('m3u8-stream-list'),
  TwitchRequest_GQL = require("./TwitchRequest_GQL");

// helper print function:
let fullTreePrint = (myObject) => util.inspect(myObject, {showHidden: false, depth: null, colors: true});

/**
 * TwitchAPI_GQL
 *
 * GQL Twitch API for important calls
 * @docs API Public DOCUMENTATION: https://github.com/mauricew/twitch-graphql-api/blob/master/USAGE.md
 * @docs API Main Page https://github.com/SuperSonicHub1/twitch-graphql-api?tab=readme-ov-file
 * @docs Information https://github.com/mauricew/twitch-graphql-api?tab=readme-ov-file
 * @docs Database Schema suspicions https://github.com/daylamtayari/Twitch-GQL/blob/master/schema.graphql#L32520
 */
class TwitchAPI_GQL {
  constructor (args={}) {
    // Authentication token, passed to Twitch to access subscriber only VODs.
    // Can be copied from the <code>auth_token</code> cookie in any browser logged in on Twitch.
    // Don't reaaaally need it for anything else. can pass one in if you want, will go to all requests
    this.TWITCH_GQL_OAUTH_TOKEN = args.TWITCH_GQL_OAUTH_TOKEN || null;

    this.MAX_NUM_DOWNLOAD_THREADS = 15; // Max num "threads" (concurrent requests) to use downloading the twitch chat
  }

  /**
   * TEST_ALL_FUNCTIONALITY
   * @param {string} [testUsername="<twitch username>"] 
   * @return Nothing - outputs a LOT to the screen to verify requests work as expected
   * @description - Run the test.js file to verify API IS STILL GOOD with this: $ node test.js
   */
  async TEST_ALL_FUNCTIONALITY (testUsername=process.env.TEST_USERNAME && process.env.TEST_USERNAME.toLowerCase() || "mang0") {
    console.log(`\n[T] ${this.constructor.name} - NOW TESTING FUNCTIONALITY OF GQL API...\n`);

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
    console.log(`[T] getVods RECENT VIDEOS FOR TESTUSER "${testUsername}": ${channelVideos.length} VIDEOS FOUND.`);

    // test clip calls
    let userDataWithClips = await this.getClipData({loginName: testUsername, numToGet: 10});
    let userClips = userDataWithClips[testUsername]?.clips?.edges?.map(el => el.node);
    console.log(`[T] getClipData FOR TESTUSER "${testUsername}". Numclips:${userClips?.length} FIRST CLIP:`, fullTreePrint(userClips[0]));

    let gameName = "League of Legends";
    let gameClipInfo = await this.getClipData({gameName: gameName, numToGet: 5});
    let [gameClips, gameVideos] = [ gameClipInfo?.clips?.edges, gameClipInfo?.videos?.edges ];
    console.log(`[T] getClipData FOR GAME "${gameName}". Numclips:${gameClips.length} FIRST CLIP:`, fullTreePrint(gameClips[0]));
    console.log(`[T] getClipData FOR GAME "${gameName}". NumVideos:${gameVideos.length} FIRST VIDEO:`, fullTreePrint(gameVideos[0]));

    if (!channelVideos.length) {
      console.log(`[T] WARNING!! NO VIDEOS WERE FOUND, CANNOT TEST VIDEO TOKEN/VODURLs/COMMENT CHAT DOWNLOAD APIs!!`);
    } else {
      // We have videos! test video stuff
      let firstVideo = channelVideos[0].node;
      console.log(`[T] getVods firstVideo: FOR TESTUSER "${testUsername}":`, fullTreePrint(firstVideo));

      let firstVideoAgain = await this.getVodMetadataById(firstVideo.id);
      console.log(`[T] getVodMetadataById sameVideo: FOR TESTUSER "${testUsername}":`, fullTreePrint(firstVideoAgain));

      let viewingTokenJson = await this.getVODViewingTokenGQL(firstVideo.id);
      console.log(`[T] getVODViewingTokenGQL TOKEN FOR firstVideo FOR TESTUSER "${testUsername}":`, fullTreePrint(viewingTokenJson));


      let vodURLs = await this.getVODURLs(firstVideo.id, viewingTokenJson.token, viewingTokenJson.sig);
      console.log(`[T] getVODURLs firstVideo FOR TESTUSER "${testUsername}":`, fullTreePrint(vodURLs));
      

      let firstCommentSet = await this.getCommentsFromVideoPartial(firstVideo.id);
      console.log(`[T] getCommentsFromVideoPartial: FIRST SECTION: (${firstCommentSet.length} comments downloaded)`);
      console.log(`[T] getCommentsFromVideoPartial: FIRST 3 COMMENTS OF SECTION:`, fullTreePrint(firstCommentSet.slice(0, 3)));

      // Does not work. Due to "Twitch Integrity Issue", cannot use cursor to paginate chat log.
      //let secondCommentSet = await this.getCommentsFromVideoPartial(firstVideo.id, 0, firstCommentSet[0].cursor);
      //console.log(`[T] getCommentsFromVideoPartial FIRST COMMENT OF SECTION2:`, fullTreePrint(secondCommentSet[0]));

      // Get full video's chat log
      let fullVODChatlog = await this.getVodChatLogs({
        vodId: firstVideo.id,
        start: 0,
        length: firstVideo.lengthSeconds, // time in seconds to get chat messages for. MUST SUPPLY.
        doReformatTheChatLog: false, // We will call reformat ourselves AFTER to disclude original message stuff
      });

      fullVODChatlog = this.reformatChatLog({chatLog: fullVODChatlog, includeOriginalMessage: false});
      let results = this.performRegexFilteringOfChatLog({chatLog: fullVODChatlog}); // requires reformat

      console.log(
        `[T] getVodChatLogs: FULL CHATLOG retrieved.`,
        `\n - Total messages count: ${fullVODChatlog.length}.`,
        `\n - Total messages count after filtering: ${results.cleanedChatLog.length}`,
        `\n - Total messages count FILTERED OUT: ${results.removedMessages.length}`,
        `\n[T] FIRST 5 COMMENTS OF FILTERED CHATLOG: ${fullTreePrint(results.cleanedChatLog.slice(0, 5))}`,
        `\n[T] FIRST 5 COMMENTS REMOVED BY FILTER: ${fullTreePrint(results.removedMessages.slice(0, 5))}`
      );
    }

    console.log(`\n[T] ${this.constructor.name} TESTING COMPLETE.\n\n`);
  }

  /**
   * _fetchNewIntegrityToken
   * @docs https://github.com/Kappador/twitch-integrity/issues/1
   * @return {
      token: 'v4.local.dibiaSyf27aildnuT44E1X9lg3kKy7IpGCvN6SXuEvKHsJ99CGA3mAaC5yy5nQDrt5gx4L-keUF28GVx8-0YpjdY5dS9bsTY5CyiHCAIMaUGCIt-7Fi2-95ZtXO4DJc3AnOEYoFfvOAfsY5NXUoVpfXc7lDA9aLyHTf0IsABnoxn9FpUxvbJhFZWbivjUhdDhj07ZxikDFjucfRe1ylavVyXchqDkB-QrXcVYpYrOmnOH49UNeQ1gbkLkSaYK-TnJlug1HFisR0AKL6ajhcmLDBypt6D650SwVH78XH2TzDey7k7fI5eXx7u-14WJup4EoAnfVzp2T7uOb5W6v77XkvtzQT6ZbQ3isWvOPWkFZxxNp3LVlO0xvzJLVSV2C1sBmy4NbgRwT5d0lvoE8HbIr92EV5p65TYw_wNb2T5lLItltSFp4W0zYnsbkGFcSu-bJ3d',
      expiration: 1735548770827,
      request_id: '01JG9NBCG999ATB7HJ8AF85T9Y'
    }
   */
  async _fetchNewIntegrityToken () {
    let json = await new TwitchRequest_GQL({
      url: `https://gql.twitch.tv/integrity`,
      method: "POST",
      name: `_fetchNewIntegrityToken`,
    }).runAsync();

    console.log(`[D] INTEGRITY JSON:`, json);

    let base64URLEncodedSection = json.token.split('.').pop();
    // decode it somehow? supposedly it is base64 URL encoded...
    
    return json;
  }

  // Call to get token and attach it to class so it is USED for every request
  async _getAndSetIntegrityToken () {
    let tokenJson = await this.getIntegrityToken();
    TwitchRequest_GQL.INTEGRITY_TOKEN = tokenJson.token;

    return tokenJson;
  }

  // Set a token with this function and it will be used in all requests
  setAnOAuthToken (oauth_token="sometokenasdfasdfasdfasdfsometoken") {
    TwitchRequest_GQL.TWITCH_GQL_OAUTH_TOKEN = oauth_token;
  }


  /**
   * getInfoForUsersByLoginName
   * @param {Array|String|Number} loginNameList - Single LoginName (Or Array of multiple) for Twitch Users
   * @param {Number} withNumClips - Optional number of clips to get in addition to user info
   * @return same as this._getInfoForUsers (THIS IS A WRAPPER FUNCTION)
   */
  async getInfoForUsersByLoginName (loginNameList=[], withNumClips=0) {
    return await this._getInfoForUsers({loginNameList: loginNameList, withNumClips: withNumClips });
  }

  /**
   * getInfoForUsersById
   * @param {Array|String|Number} idList - Single UserId (Or Array of multiple) for Twitch Users
   * @param {Number} withNumClips - Optional number of clips to get in addition to user info
   * @return same as this._getInfoForUsers (THIS IS A WRAPPER FUNCTION)
   */
  async getInfoForUsersById (idList=[], withNumClips=0) {
    return await this._getInfoForUsers({idList: idList, withNumClips: withNumClips });
  }
  
  /**
   * _getInfoForUsers
   * @param {String} queryType MUST be either "ids" OR "logins"
   * @docs https://github.com/lay295/TwitchDownloader/blob/master/TwitchDownloaderCore/TwitchHelper.cs#L1050 GetUserInfo
   * @docs https://github.com/lay295/TwitchDownloader/blob/master/TwitchDownloaderCore/TwitchHelper.cs#L1036 GetUserIds
   * @return streamInfoHash - a hash with key being LOGIN_NAME and value being the USER INFO OBJECT
   * @sampledata received: {
      data: {
        users: [
          { // other credentials available by adding to the list in {id,etc,etc,etc} section of query
            id: '26551727',
            displayName: 'mang0',
            login: 'mang0',
            createdAt: '2011-12-04T02:08:16.254762Z',
            updatedAt: '2024-12-28T05:55:03.688413Z',
            description: ':3',
            profileImageURL: 'https://static-cdn.jtvnw.net/jtv_user_pictures/8647bb3a-1e64-4839-987f-6aec0b44a223-profile_image-300x300.png'
          }
        ]
      },
      extensions: { durationMilliseconds: 20, requestID: '01JG885SSJH7TFF7650EX9YGTV' }
    */
  async _getInfoForUsers ({
    idList=null,
    loginNameList=null,
    withNumClips=0
  }) {
    if (idList && loginNameList) {
      throw `[!] ${this.constructor.name}._getInfoForUsers ERR - cannot take both idList and loginNameList!!`;
    } else if (!idList && !loginNameList) {
      throw `[!] ${this.constructor.name}._getInfoForUsers ERR - must specify idList or loginNameList`;
    }
    
    let targetList = idList || loginNameList; // set to whichever is valid
    let queryType = idList ? "ids" : "logins"; // if idList is null, we're using loginNameList.

    if (typeof(targetList) === "string" || typeof(targetList) === "number") {
      targetList = [ targetList ]; // if a string or number was passed in, convert it to an array for the API format.
    }

    let formattedIdListStr = targetList.map(x => `"${x}"`).join(","); // string format for GQL query

    // Add query for extra clips IF it was specified. Otherwise this will be EMPTY STRING
    // first:10 can be replaced with 'criteria: { period: LAST_MONTH }' if that is interesting
    let optionalClipsQuery = withNumClips ? `
      clips(first: ${withNumClips}) {
                edges {
                  node {
                    id
                    title
                    viewCount
                    createdAt
                    durationSeconds
                    curator {
                      login
                    }
                    broadcaster {
                      login
                    }
                  }
                }
              }`
      : "";

    // Send query. We'd add the stream { } to the query too, but that can only be one user.
    let json = await new TwitchRequest_GQL({
      url: `https://gql.twitch.tv/gql`,
      method: "POST",
      json: {
        "query": `query {
                    users( ${queryType}: [${formattedIdListStr}] ) {
                      id,
                      login,
                      displayName,
                      createdAt,
                      updatedAt,
                      description,
                      profileImageURL(width:300)
                      ${optionalClipsQuery}
                    }
                  }`.replace(/\s\s+/, ' '),
        "variables": {},
      },
      name: `getInfoForUsersBy_${queryType}`,
    }).runAsync();
    

    let streamInfoHash = {};
    json.data.users.forEach(info => streamInfoHash[info.login] = info);

    return streamInfoHash;
  }

 /**
   * getStreamStatus
   * @param identifier - Search with either channelId or login_name of a twitch user
   * @param searchByNameInsteadOfById - Boolean to toggle between channelId or userId.
   * @docs https://github.com/mauricew/twitch-graphql-api/blob/master/USAGE.md
   * @docs https://github.com/daylamtayari/Twitch-GQL/blob/master/schema.graphql#L32520 for stream status
   * @returns {Array} ALWAYS. Each object element is user details, of which .stream be EMPTY if offline
   * @returns json.data -> the .user is available, the .stream WILL BE NULL IF OFFLINE.
   * {
      "data": {
        "user": {
          "id": "275458965",
          "login": "vgtv_melee",
          "displayName": "VGTV_Melee",
          "description": "10+ years of Melee history...",
          "createdAt": "2018-11-16T18:16:03.406077Z",
          "roles": {
            "isPartner": true
          },
          "stream": {
            "id": "43453292632",
            "title": "24/7 Tournament Matches - Best of Smash Melee",
            "type": "live",
            "viewersCount": 8,
            "createdAt": "2024-12-27T14:39:16Z",
            "game": {
              "name": "Super Smash Bros. Melee"
            }
          }
        }
      },
      "extensions": {
        "durationMilliseconds": 58,
        "requestID": "01JG8QJVDVJGSGMW3A70H1F16J"
      }
    }
   */
  async getStreamStatusById (idList) { return await this._getStreamStatus(idList, "id") }
  async getStreamStatusByLoginName (nameList) { return await this._getStreamStatus(nameList, "login") }
  async _getStreamStatus (idList, queryType="id" || "login") {
    if (!(idList instanceof Array) && typeof(idList) !== "number" && typeof(idList) !== "string") {
      throw "[!] TwitchAPI.getStreamStatus ERR - videoIDs must be an Array, String, or number!!";
    } else if (!(idList instanceof Array)) { // is good, is string or number
      idList = [ idList ]; // wrap in array for the API user, must be for below
    }

    // these extra details... probably aren't needed and can be easily removed, but they're available
    let extraStreamDetailsQuery = `
      averageFPS
      bitrate
      broadcasterSoftware
      codec
      height
      width`;

    // NOTE: This query CANNOT take multiple users at once, because of the stream { } section.
    // If the stream part were omitted, then they allow it... Instead we use Promise.all
    let arrayOfResults = await Promise.all(
      idList.map(async (identifier) => {
        let json = await new TwitchRequest_GQL({
          url: `https://gql.twitch.tv/gql`,
          method: "POST",
          name: `getStreamStatusBy_${queryType}`,
          json: {
            "query": `query {
                        user(${queryType}: "${identifier}") {
                          id
                          login
                          displayName
                          description
                          createdAt
                          updatedAt,
                          roles {
                            isPartner
                          }
                          stream {
                            id
                            title
                            type
                            viewersCount
                            createdAt
                            ${extraStreamDetailsQuery}
                            game {
                              id,
                              name,
                              displayName,
                              boxArtURL
                            }
                          }
                        }
                      }`.replace(/\s\s+/g, ' '),
            "variables": {},
          }
        }).runAsync();

        return json.data.user;
      })
    );

    // set .isLive to the truthiness of the returned .stream object, of which contains things like title etc
    arrayOfResults.forEach(user => user.isLive = !!user.stream);

    return arrayOfResults;
  }


  /**
   * getVods - MONSTER function
   * @param options - Get VOD metadatas for VODs of a channel with pagination, basically
   * @docs https://github.com/lay295/TwitchDownloader/blob/master/TwitchDownloaderCore/TwitchHelper.cs#L156 GetGqlVideos
   * @docs twitch-dl https://github.com/ihabunek/twitch-dl/blob/46c0314e4468d398ec8e9e02f895b39fdd7c7d96/twitchdl/twitch.py#L215
   * @return json.data.user.videos.edges of this: {
      data: {
        user: {
          videos: {
            edges: [
              {
                node: {
                  title: 'FORTY FRIDAY',
                  id: '2337751384',
                  lengthSeconds: 24860,
                  previewThumbnailURL: 'https://static-cdn.jtvnw.net/cf_vods/d1m7jfoe9zdc1j/58962d01c4bb83db9ae0_mang0_52795657229_1735355782//thumb/thumb0-320x180.jpg',
                  createdAt: '2024-12-28T03:16:28Z',
                  viewCount: 11670,
                  game: { id: '1264310518', displayName: 'Marvel Rivals' }
                },
                cursor: '2308406450|13611|2024-11-22T19:20:07Z|19860'
              },
              ... more videos
            ]
          }
        }
      },
      extensions: { durationMilliseconds: 82, requestID: '01JG885SZATS5THKE11HREA6ZK' }
    }  
   */
  async getVods ({
    channelId=null,
    channelName=null,
    videoIDs=null,
    numVodsIncrement=20, /* first */ // from 1-100 how many per page (weird that they use "first", I know)
    cursorForAfter='',
    cursorForBefore='',
    type="archive", // can be all, archive, highlight, upload
    sort="time", // can be time, time_asc, views, and you'd THINK trending to match Helix API, BUT NO.
    period="all", // CANNOT SEEM TO FIND SUPPORT IN GQL. (in helix API, can be all, day, week, month)
  }) {
    let cursorPart = '';

    if (cursorForAfter) {
      cursorPart = `,after:"${cursor}"`;
    } else if (cursorForBefore) {
      cursorPart = `,before:"${cursor}"`;
    }

    let userQueryType = '';

    if (channelName) {
      userQueryType = "login"; // search by username
    } else if (channelId) {
      userQueryType = "id";
    } else if (videoIDs) {
      return await this.getVodMetadataById(videoIDs);
    } else {
      throw `[!] ${this.constructor.name}.getVods ERR: No search query was passed. Use either channelId/name/vodIds`;
    }

    // convert allowed types by Helix API and this function to the style REQUIRED by Twitch GQL
    /* from @docs https://github.com/daylamtayari/Twitch-GQL/blob/master/schema.graphql#L2802
        enum BroadcastType {
        ARCHIVE # If the video is of a past broadcast, it's an ARCHIVE.
        HIGHLIGHT # When the video is a subsection of a past broadcast, it's a HIGHLIGHT.
        UPLOAD # (Legacy) When the video is directly uploaded to Twitch via the upload tool, it's an UPLOAD.
        PREMIERE_UPLOAD # When the video is directly uploaded to Twitch via the video manager, it's an PREMIERE_UPLOAD.
        PAST_PREMIERE  # When a video has been premiered on Twitch and is saved, it's a PAST_PREMIERE.
      } */
    // convert allowed types by Helix API and this function to the style REQUIRED by Twitch GQL
    let GQL_TYPE_QUERY = {
      "all": "", // You'd think it'd be ALL, but no, you either do type:null or NO type at all.
      "archive": ",type:ARCHIVE",
      "highlight": ",type:HIGHLIGHT",
      "upload": ",type:UPLOAD",
    };

    let typeQuery = GQL_TYPE_QUERY[type];
    if (!typeQuery) throw `[!] ${this.constructor.name}.getVods - ERR: type MUST be one of [all,archive,highlight,upload]`;

    // convert allowed types by Helix API and this function to the style REQUIRED by Twitch GQL
    /* from @docs https://github.com/daylamtayari/Twitch-GQL/blob/master/schema.graphql#L34712
    enum VideoSort {
      TIME # Sort the videos descending by time (publishedAt if available or createdAt).
      TIME_ASC # Sort the videos ascending by time (publishedAt if available or createdAt).
      VIEWS  # Sort the videos descending by views.
    } */
    let GQL_SORT_QUERY = {
      "time": ",sort:TIME", // default
      "time_asc": ",sort:TIME_ASC", // earliest posted videos first
      //"trending": ",sort:TRENDING", // IT SEEMS GQL API SIMPLY DOES NOT SUPPORT THIS SORT METHOD.
      "views": ",sort:VIEWS",
    };

    let sortQuery = GQL_SORT_QUERY[sort];
    if (!sortQuery) throw `[!] ${this.constructor.name}.getVods - ERR: type MUST be one of [all,archive,highlight,upload]`;
    
    let json = await new TwitchRequest_GQL({
      url: `https://gql.twitch.tv/gql`,
      method: "POST",
      json: {
        "query": `query{
                    user(${userQueryType}:"${channelName}") {
                      videos(first: ${numVodsIncrement}${cursorPart}${typeQuery}${sortQuery}) {
                        edges {
                          node {
                            title,
                            id,
                            lengthSeconds,
                            previewThumbnailURL(height: 180, width: 320),
                            createdAt,
                            viewCount,
                            game {id, name, displayName, boxArtURL } },
                            cursor
                          },
                        pageInfo { hasNextPage, hasPreviousPage }, 
                        totalCount
                      }
                    }
                  }`.replace(/\s\s+/gi, ' '),
        "variables": {},
      },
      name: "getVods",
    }).runAsync();
      
    return json.data.user.videos.edges;
  }

  /**
   * getVodMetadataById
     curl -X POST 'https://gql.twitch.tv/gql' \
       -H 'Client-Id: <CLIENT_ID>' \
       -d '{"query":"query{video(id:\"2337751384\"){title,thumbnailURLs(height:180,width:320),createdAt,lengthSeconds,owner{id,displayName,login},viewCount,game{id,displayName,boxArtURL},description}}","variables":{}}'
   * @param vodId - THIS GQL QUERY CAN ONLY TAKE ONE VIDEO ID. More in the other Array styles do NOT seem to work.
   * @docs https://github.com/lay295/TwitchDownloader/blob/master/TwitchDownloaderCore/TwitchHelper.cs#L31 GetVideoInfo
     @returns json.data of this: {
      "data": {
        "video": {
          "title": "FORTY FRIDAY",
          "thumbnailURLs": [
            "https://static-cdn.jtvnw.net/cf_vods/d1m7jfoe9zdc1j/58962d01c4bb83db9ae0_mang0_52795657229_1735355782//thumb/thumb0-320x180.jpg",
          ],
          "createdAt": "2024-12-28T03:16:28Z",
          "lengthSeconds": 24860,
          "owner": {
            "id": "26551727",
            "displayName": "mang0",
            "login": "mang0"
          },
          "viewCount": 11547,
          "game": {
            "id": "1264310518",
            "displayName": "Marvel Rivals",
            "boxArtURL": "https://static-cdn.jtvnw.net/ttv-boxart/1264310518_IGDB-{width}x{height}.jpg"
          },
          "description": null
        }
      },
      "extensions": {
        "durationMilliseconds": 42,
        "requestID": "01JG7RVSKA2RE8DH3JXQWSQK0S"
      }
    }
  */
  async getVodMetadataById (idList) {
    if (typeof(idList) === "string" || typeof(idList) === "number") {
      idList = [ idList ]; // if a string or number was passed in, convert it to an array for the API format.
    }

    // Do some shenanigans to make this call that SHOULD be a single GQL call all return one array.
    // The query CANNOT take multiple arguments, hence using Promise.all
    let arrayOfResults = await Promise.all(
      idList.map(async (vodId) => {
        
        let json = await new TwitchRequest_GQL({
          url: `https://gql.twitch.tv/gql`,
          method: "POST",
          json: {
            "query": `query{
                      video(id:"${vodId}") {
                        title,
                        thumbnailURLs (height:180,width:320),
                        createdAt,
                        lengthSeconds,
                        owner {
                          id,
                          displayName,
                          login
                        },
                        viewCount,
                        game {
                          id,
                          name,
                          displayName,
                          boxArtURL
                        },
                        description
                      }
                    }`.replace(/\s\s+/gi, ' '),
            "variables": {}
          },
          name: "getVodMetadataById",
        }).runAsync();
        
        return json.data;
      })
    );

    // flatten 1 level up, I think GQL returns an array, so this alleviates arrays of arrays
    let allVods = arrayOfResults.flat();

    return allVods;
    //return (allVods.length == 1) ? allVods[0] : allVods; // if only one vodID, send without array? may break code...
  }

  /**
   * getVODViewingTokenGQL
      curl -X POST 'https://gql.twitch.tv/gql' \
        -H 'Authorization: Bearer <TOKEN>' \
        -H 'Client-Id: <CLIENT_ID>' \
        -d '{"operationName":"PlaybackAccessToken_Template","query":"query PlaybackAccessToken_Template($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!) {  streamPlaybackAccessToken(channelName: $login, params: {platform: \"web\", playerBackend: \"mediaplayer\", playerType: $playerType}) @include(if: $isLive) {    value    signature    __typename  }  videoPlaybackAccessToken(id: $vodID, params: {platform: \"web\", playerBackend: \"mediaplayer\", playerType: $playerType}) @include(if: $isVod) {    value    signature    __typename  }}","variables":{"isLive":false,"login":"","isVod":true,"vodID":"2337751384","playerType":"embed"}}'
    * @param vodId 
    * @docs https://github.com/lay295/TwitchDownloader/blob/master/TwitchDownloaderCore/TwitchHelper.cs#L45 GetVideoToken
    * @docs https://github.com/lay295/TwitchDownloader/blob/b51f7245a9bf38ddccbe6b40a35347e7b27d9aa8/TwitchDownloaderCore/VideoDownloader.cs#L565
    * @docs https://github.com/lay295/TwitchDownloader/blob/b51f7245a9bf38ddccbe6b40a35347e7b27d9aa8/TwitchDownloaderCLI/Modes/InfoHandler.cs#L88
    * @return {"token": token, "sig": sig, fullJsonResponse:  <FULL JSON BELOW> }
    * {
      "data": {
        "videoPlaybackAccessToken": {
          "value": "{\"authorization\":{\"forbidden\":false,\"reason\":\"\"},\"chansub\":{\"restricted_bitrates\":[]},\"device_id\":null,\"expires\":1735498469,\"https_required\":true,\"privileged\":false,\"user_id\":null,\"version\":2,\"vod_id\":2337712345}",
          "signature":"f45801db13d8fc1fac72fcf99b649b3dcccccccc",
          "__typename":"PlaybackAccessToken"
        }
      },
      "extensions": {
        "durationMilliseconds":59,
        "operationName":"PlaybackAccessToken_Template",
        "requestID":"01JG7QMVGG30PM0QSYWWWWWWWW"
      }
    }
   */
  async getVODViewingTokenGQL (vodId=null) {
    let json = await new TwitchRequest_GQL({
      url: `https://gql.twitch.tv/gql`,
      method: "POST",
      json: {
        "operationName":"PlaybackAccessToken_Template",
        "query": "query PlaybackAccessToken_Template($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!) "
          + "{  streamPlaybackAccessToken(channelName: $login, params: {platform: \"web\", playerBackend: \"mediaplayer\", playerType: $playerType}) "
          + "@include(if: $isLive) {    value    signature    __typename  }  videoPlaybackAccessToken(id: $vodID, " 
          + "params: {platform: \"web\", playerBackend: \"mediaplayer\", playerType: $playerType}) @include(if: $isVod) {    value    signature    __typename  }}",
        "variables":{
          "isLive":false,
          "login":"",
          "isVod":true,
          "vodID": vodId.toString(), // enforce string
          "playerType":"embed"
        }
      },
      name: "getVODViewingTokenGQL",
    }).runAsync();

    return {
      token: json.data.videoPlaybackAccessToken.value,
      sig: json.data.videoPlaybackAccessToken.signature,
      fullJsonResponse: json, // if useful
    };
  }

  /**
   * getVODURLs
   * @param vodId - video ID
   * @docs https://github.com/lay295/TwitchDownloader/blob/master/TwitchDownloaderCore/TwitchHelper.cs#L61 GetVideoPlaylist
   * @receivesample some crazy stuff like this: '#EXTM3U\n' +
  '#EXT-X-STREAM-INF:BANDWIDTH=290576,CODECS="avc1.4D000C,mp4a.40.2",RESOLUTION=284x160,VIDEO="160p30",FRAME-RATE=30.000\n' +
  'https://d2vjef5jvl6bfs.cloudfront.net/58962d01c4bb83db9ae0_mang0_52795657229_1735355782/160p30/index-muted-LPOY79IN65.m3u8'
   * @returns JSON Object of video URLs to choose downloading from.
   */
  async getVODURLs (vodId, token="", sig="") {
    if (!token || !sig) throw `[!] ${this.constructor.name}.getVODURLs ERR: token and sig CANNOT be null!`;
    
    let m3u8_urls_raw_file = await new TwitchRequest_GQL({
      url: `https://usher.ttvnw.net/vod/${vodId}.m3u8?sig=${sig}&token=${token}` 
       + `&allow_source=true&allow_audio_only=true&platform=web&player_backend=mediaplayer`
       + `&playlist_include_framerate=true&supported_codecs=av1,h265,h264`,
      method: "GET",
      name: "getVODURLs",
    }).runAsync();

    // If good, send it back. If not, try second source...
    if (!m3u8_urls_raw_file || m3u8_urls_raw_file.error) {
      console.log("[D] getVODURLs usher.ttvnw.net error, trying backup source. ERR RESP:", m3u8_urls_raw_file);

      m3u8_urls_raw_file = await new TwitchRequest_GQL({
        url: `https://twitch-downloader-proxy.twitcharchives.workers.dev/${vodId}.m3u8?sig=${sig}&token=${token}`
         + `&allow_source=true&allow_audio_only=true&platform=web&player_backend=mediaplayer`
         + `&playlist_include_framerate=true&supported_codecs=av1,h265,h264`,
        method: "GET",
        name: "getVODURLs_2ndtry_proxydownloader",
      }).runAsync();

      // Twitch returns 403 Forbidden for (some? all?) sub-only VODs when correct authorization is not provided
      // if (data.contains("vod_manifest_restricted") || data.contains("unauthorized_entitlements"))
      //   return {"error": "FORBIDDEN_VOD"}
    }

    if (!m3u8_urls_raw_file || m3u8_urls_raw_file.error) {
      console.log("[D] getVODURLs_2ndtry_proxydownloader ALSO failed. Returning 404. ERR RESP:", m3u8_urls_raw_file);
      return 404;
    }

    if (m3u8_urls_raw_file == 404) {
      return 404;
    } else if (m3u8_urls_raw_file.indexOf('Manifest is resticted') != -1) {
      console.log("[D] getVODURLs m3u8 RESTRICTED (likely to subscribers only). 404'ing. RESPONSE:", m3u8_urls_raw_file);
      return "SUBSCRIBERS_ONLY"; // This video is only available to Subscribers of the channel... Nuts!!
    } else if ((m3u8_urls_raw_file.indexOf("vod_manifest_restricted") != -1) || (m3u8_urls_raw_file.indexOf("unauthorized_entitlements") != -1)) {
      console.log("[D] getVODURLs new age VOD m3u8 RESTRICTED! vod_manifest/unauthorized. 404'ing. RESPONSE:", m3u8_urls_raw_file);
      return "SUBSCRIBERS_ONLY"; 
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



 /**
  * getCommentsFromVideoPartial
  * @docs https://github.com/lay295/TwitchDownloader/blob/b51f7245a9bf38ddccbe6b40a35347e7b27d9aa8/TwitchDownloaderCore/ChatDownloader.cs#L45 DownloadSection
  * @return JSON Object response from Twitch GQL. SEE getVodChatLogs's comments/documentation for specifics
  */
  async getCommentsFromVideoPartial (vodId, videoStart=0, cursor="") {
    let postData = {
      "operationName": "VideoCommentsByOffsetOrCursor",
      "variables": {
        "videoID": vodId,
        // "contentOffsetSeconds": videoStart, // Use on FIRST call
        // "cursor": cursor, // Use on 2nd and later calls
        },
        "extensions": {
        "persistedQuery": { 
          "version": 1,
          "sha256Hash": "b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a"
        }
      }
    };

    // For FIRST call, no cursor exists, so we use contentOffsetSeconds
    if (!cursor) {
      postData["variables"]["contentOffsetSeconds"] = videoStart;
    } else {
      // we are paginating
      postData["variables"]["cursor"] = cursor;
    }

    let json = await new TwitchRequest_GQL({
      url: `https://gql.twitch.tv/gql`,
      method: "POST",
      json: postData,
      name: "getCommentsFromVideoPartial",
    }).runAsync();

    if (json === 404) {
      // Video probably deleted
      console.log(
        `[D] getCommentsFromVideoPartial hit 404 for vodId=${vodId}, cursor=${cursor}\n`
      );
      return (404);
    } else if (json.error || json.errors) {
      // BIG PROBLEM?
      console.log(
        `[!] getVodChatLogs ERROR RETURNED for vodId=${vodId}, cursor=${cursor}\n` +
        `[!] HERE IS THE ERROR JSON RECEIVED:`, fullTreePrint(json)
      );
      return (404);
    }

    // One must manually strip off any comments
    // "video.comments can be null for some dumb reason"
    // if (commentResponse.data.video.comments?.edges is null && ++nullCount > 10) throw "[!] Too many null comments";

    // Got Comments! Each message is in .node, move them up and sort them by timestamp ascending
    let comments = (json.data.video.comments.edges || [])
      .map(edgeItem => edgeItem.node) // potentially add post-processing options here...
      .sort((a, b) => a.contentOffsetSeconds - b.contentOffsetSeconds);

    let lastCommentTime = comments[comments.length - 1].contentOffsetSeconds;
  
    return comments; // In doing this, we strip out the "video" obj details outside of the comments, is ok
 }

  /**
   * getVodChatLogs - Downloads full log of messages from a twitch video. MONSTER of a function. 
   * NOTE: SHARES A LOT WITH this.getCommentsFromVideoPartial REFERENCE ITS COMMENTS/CODE ABOVE AS WELL.
   * @param {String|Number} vodId - Video ID to fetch chat for 
   * @param {Number} start - time in seconds to start from in the video to fetch messages
   * @param {Number} length - time in seconds to fetch messages UNTIL, adding to start (not the stopping point timestamp)
   * @param {Number} numWorkers - total number of "worker threads" for node to use.
   * 
   * @returns Giant JSON representation of the full chat log.
   * 
   * @receivesample {
      data: {
        video: {
          id: '2337751384',
          creator: { // this is the VIDEO creator
            id: '26551727',
            channel: { id: '26551727', __typename: 'Channel' },
            __typename: 'User'
          },
          comments: {
            edges: [ {COMMENTOBJ1}, {COMMENTOBJ2} ],
            pageInfo: {
              hasNextPage: true,
              hasPreviousPage: false,
              __typename: 'PageInfo'
            }
          },
          __typename: 'Video'
        }
      },
      extensions: {
        durationMilliseconds: 62,
        operationName: 'VideoCommentsByOffsetOrCursor',
        requestID: '01JG98DYFF0Z5N4SC64CR9DQVQ'
      }
    }

    And Comment objects are of this form:
    {
      cursor: 'eyJpZCI6IjRjNmI5NTAwLTY5N2EtNGI5Ny1iZTBhLTFlZjg3N2I3MDU2MiIsImhrIjoiYnJvYWRjYXN0OjUyNzk1NjU3MjI5Iiwic2siOiJBQUFBeTNYQjI0QVlGVG13dGlONmdBIn0',
      node: {
        id: '4c6b9500-697a-4b97-be0a-1ef877b70562',
        commenter: {
          id: '267030574',
          login: 'breh_',
          displayName: 'Breh_',
          __typename: 'User'
        },
        contentOffsetSeconds: 873,
        createdAt: '2024-12-28T03:31:02.554Z',
        message: {
          fragments: [
            {
              emote: null,
              text: 'of course man, glad to support my favorite streamer',
              __typename: 'VideoCommentMessageFragment'
            }
          ],
          userBadges: [
            {
              id: 'Ozs=',
              setID: '',
              version: '',
              __typename: 'Badge'
            },
            {
              id: 'c3ViLWdpZnRlcjsxMDs=',
              setID: 'sub-gifter',
              version: '10',
              __typename: 'Badge'
            }
          ],
          userColor: '#B26422',
          __typename: 'VideoCommentMessage'
        },
        __typename: 'VideoComment'
      },
      __typename: 'VideoCommentEdge'
    }

    NOTE: EVERY CHATLOG MESSAGE is a .node and has a cursor, and in a single request they ALL have the same cursor
   */
  async getVodChatLogs ({
    vodId,
    start=0,
    length=null,
    numWorkers=this.MAX_NUM_DOWNLOAD_THREADS,
    doReformatTheChatLog=true, // reformatting converts to simple keys: "message", "username", "contentOffsetSeconds"
    CURSOR_INTEGRITY_DODGE=1,
  }) {
    if (!length || !parseInt(length) || length < 5) {
      throw `[!] ${this.constructor.name}.getVodChatLogs ERR - length (of video) MUST BE A NUMBER and > 5!!!`;
    }

    if (CURSOR_INTEGRITY_DODGE) {
      process.env.DEBUG && console.log(`[D] getVodChatLogs.CURSOR_INTEGRITY_DODGE=true, sad but necessary`);
    }

    return await new Promise((resolve, reject) => {
      // segments downloaded in parallel with this many workers
      let nWorkers = Math.max(1, Math.min(Math.ceil(length / 600), numWorkers)); // 1 to 15 "threads" for each 10 minutes of video
      let results = [];
      let numCompletedWorkers = 0;
      let bailNow = false;
      let timePerWorker = length / nWorkers; // don't need to Math.floor/ceil

      let processOne = async (workerIndex, numRequestsThisThread=0, cursor=null) => {
        let workerStartTime = Math.floor(start + (timePerWorker * workerIndex)); // .floor not needed, seems nice though?
        let timeBoundary = workerStartTime + timePerWorker;

        let logMsg = `[D] getVodChatLogs - ` +
          ` worker START: REQUEST #${numRequestsThisThread + 1} by WORKER #${workerIndex + 1}/${nWorkers}\n`;

        process.env.DEBUG && console.log(logMsg);

        // Download segment
        let postData = {
          "operationName": "VideoCommentsByOffsetOrCursor",
          "variables": {
            "videoID": vodId,
            // "contentOffsetSeconds": videoStart, // Use on FIRST call
            // "cursor": cursor, // Use on 2nd and later calls
            },
            "extensions": {
            "persistedQuery": { 
              "version": 1,
              "sha256Hash": "b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a"
            }
          }
        };
    
        // determine pagination style
        // For FIRST call, no cursor exists, so we use contentOffsetSeconds
        if (numRequestsThisThread === 0 /*WAS: !cursor*/) {
          postData["variables"]["contentOffsetSeconds"] = workerStartTime; // WAS: videoStart;
        } else if (CURSOR_INTEGRITY_DODGE) { // 2024
          // This isn't ideal, but we do this because using their cursor to paginate
          // results in "integrity check error" and can't figure out what they want.
          // So instead of offering the cursor token THAT THEY give us, 
          // we set the "cursor" variable to the timestamp of the latest comment received
          postData["variables"]["contentOffsetSeconds"] = cursor; // IS NOT CURSOR TOKEN HERE, IS TIME IN SECONDS
        } else {
          // we are paginating with cursor
          postData["variables"]["cursor"] = cursor;
          if (!cursor) throw `[!!] CURSOR WAS INVALID`; console.log(cursor);
        }

        // Download segment
        let json = await new TwitchRequest_GQL({
          url: `https://gql.twitch.tv/gql`,
          method: "POST",
          json: postData,
          name: "getVodChatLogs_worker_request",
        }).runAsync();
    
        // One must manually strip off any comments
        // "video.comments can be null for some dumb reason"
        // if (commentResponse.data.video.comments?.edges is null && ++nullCount > 10) throw "[!] Too many null comments";
    
        // Check if any http/json response issues...
        if (bailNow) {
          return;
        } else if (json === 404) {
          // Video probably deleted
          console.log(
            `[D] getVodChatLogs hit 404 for vodId=${vodId}\n` +
            ` - on REQUEST #${numRequestsThisThread + 1} by WORKER #${workerIndex + 1}/${nWorkers}\n`
          );
          bailNow = true; // stop future request attempts
          return resolve(404);
        } else if (json.error || json.errors) {
          // BIG PROBLEM?
          console.log(
            `[!] getVodChatLogs ERROR RETURNED for vodId=${vodId}\n` +
            ` - on REQUEST #${numRequestsThisThread + 1} by WORKER #${workerIndex + 1}/${nWorkers}\n` +
            `[!] HERE IS THE ERROR JSON RECEIVED:`, fullTreePrint(json)
          );
          bailNow = true; // stop future request attempts
          return resolve(404);
        }

        // Got Comments! Each message is in .node, move them up and sort them by timestamp ascending
        let comments = (json.data.video.comments.edges || [])
          .map(edgeItem => edgeItem.node) // potentially add post-processing options here...
          .sort((a, b) => a.contentOffsetSeconds - b.contentOffsetSeconds)

        let lastCommentTime = comments[comments.length - 1].contentOffsetSeconds;

        // - NOTE: EVERY CHATLOG MESSAGE is a .node and has a cursor, and in a single request they ALL have the same cursor
        //   json.data.video.comments.pageInfo is supplied to say pagination options as so:
        //   pageInfo: { hasNextPage: true, hasPreviousPage: false, __typename: 'PageInfo' }
        let _next = json.data.video.comments.pageInfo.hasNextPage && comments[comments.length - 1].cursor;

        // - NOTE 2024: we set the "cursor" variable to the timestamp of the latest comment received
        if (CURSOR_INTEGRITY_DODGE && _next) { _next = lastCommentTime - 1; } // - 1 in case they cut off part of a second

        results[workerIndex].push(comments); // make an array of arrays

        process.env.DEBUG && console.log(`[D] getVodChatLogs - action done for worker #${workerIndex + 1}. LEN=${comments.length} lastTime=${lastCommentTime} next=${_next},`);

        // Check if this worker is DONE with its section of comments
        // NOTE: THERE IS A CONCERN on the last worker fetching endlessly at end IF hasNextPage is a lie
        // and the only way to VERIFY completion is "latest request has no new comments"... THOUGH
        // a bad alternative is "is lastCommentTime within 5-10 seconds of timeBoundary (stopping point/video length)"
        let workerIsDone = (comments.length > 0 && lastCommentTime >= timeBoundary) || !_next;

        if (workerIsDone) {
          // Worker done! Check if ALL workers done
          if (++numCompletedWorkers == nWorkers) {
            // ALL WORKERS DONE, combine ALL results and remove duplicates! else wait for other workers
            let seen = {};
            let filteredvalues = [].concat.apply([], [].concat.apply([], results)).filter(msg => {
              // 2024 GQL NOTE: each comment has unique ID we can use instead. Also message.body doesn't exist now.
              // let key = msg.contentOffsetSeconds + '_' + msg.message.body;
              let key = msg.id;
              
              if (!msg.id || !msg.id.length || msg.id.length < 3) {
                let e = `[!] getVodChatlogs ERR!!! Returned messages have bad message IDs!! msg.id was:` + fullTreePrint(msg.id);
                console.log(e); throw e;
              }

              return seen.hasOwnProperty(key) ? false : (seen[key] = true);
            });

            process.env.DEBUG && console.log(`[D] getVodChatLogs DONE. Num msgs: ${filteredvalues.length}`);
            process.env.DEBUG && console.log(`[D] getVodChatLogs DONE. First message:`, filteredvalues[0]);

            // reformat it to simpler style UNLESS flagged not to
            if (doReformatTheChatLog) {
              filteredvalues = this.reformatChatLog({chatLog: filteredvalues});
            }

            return resolve(filteredvalues); // merge array of arrays
          } else {
            process.env.DEBUG && console.log(`[D] ${numCompletedWorkers}/${nWorkers} workers done, waiting on others`);
          }
        } else {
          // Get next array of comments for this boundary
          return process.nextTick(() => processOne(workerIndex, numRequestsThisThread + 1, _next));
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

  /**
   * reformatChatLog
   * Convert each message to simple object with keys "message", "username", "contentOffsetSeconds"
   */
  reformatChatLog ({chatLog: chatLog=[], includeOriginalMessage=true}) {
    return chatLog.map((msg) => {
      let newMsg = {
        // amalgamate all the fragments into one single message... I guess
        message: msg.message.fragments.reduce((aggregate, current) => aggregate + (current.text || ''), ''),
        // Format comes as: commenter: { id: '267031234', login: 'chatter123', displayName: 'Chatter123', __typename: 'User' };
        // msg.commenter CAN BE NULL FROM TWITCH VIDEO!! Anonymous comment? Well, it'll be null...
        username: msg.commenter?.displayName || msg.commenter?.login || null,
        // Don't really need to round...?
        contentOffsetSeconds: Math.round(msg.contentOffsetSeconds),
      };

      if (includeOriginalMessage) {
        newMsg["_originalFromTwitchAPI"] = msg; // conserve original
      }

      return newMsg;
    });
  }
  

  /**
   * performRegexFilteringOfChatLog - To remove bot/horrible/irrelevant messages
   * NOTE: THIS IS ONLY USED FOR TESTING AND IS DUPLICATE CODE FROM THE MANAGER. DO NOT EXPECT UPDATES.
   * @param {Array} chatLog - twitch chat log
   * @returns {Object} { cleanedChatLog: Array, removedMessages: Array }
   */
  performRegexFilteringOfChatLog ({ chatLog: chatLog=[], }) {    
    // improve selection of valuable messages
    // XXX: REMAINING CLIP SELECTION OPTIMIZATION IDEAS:
    // 1. Cut to a third the buckets where the STREAM OWNER (+mods?) post messages
    // 2. No clips BELOW MINIMUM comment count (might ruin streams with <0.6 comments per second)
    // 3. No clips with ZERO messages fitting the below hype regex
    // 4. No clips OF RAFFLES... Dump buckets with 50% or more of THE SAME EXACT MESSAGE
    // 5. Destroy greeting clips

    let regexFilters = [
      // basic twitch stuff
      /@/, // remove messages that target someone else in chat,. hype doesn't have chat conversation
      /http/,
      /<message deleted>/,
      /^!/, // remove messages speaking to a bot in chat
      // greetings
      /^h{1,}i{1,}( *guys)*$|^he{1,}llo{1,}( *guys)*$/i,
      // subscription stuff
      /subscribed at Tier/,
      /gifted a Tier [0-9]* Sub/i,
      /They've subscribed for/i,
      /They've gifted a total of/i,
      /is gifting [0-9]* Tier/i,
      /subscribed with Prime\. They've/,
      // common bot messages
      /^Enjoying the stream\?/,
      /\bMERCH:\b/, // merch stuff
      /\bTwitch Prime\b/,
      // mic/cam down stuff
      /we can[']*t (hear|see)/i,
      /no ((face)*cam|mic|stream)/i,
      /(cam|mic|audio|video|stream)( is)* (down|broke|broken)/i,
      /(fix|check) (your|ur|the) (mic|cam|audio|video|stream)/i,
      // stream restarts
      /^(we[']*re )*ba{1,}ck(\!)*$/i,
      /^(the )*(stream|video|audio)( is)* ba{1,}ck(\!)*$/i,
      // GIRL.
      /^g{,1}i{1,}r*l*(\!)*$/i, // girl! girrl ggiirrll
      /\b(gril)\b/i, // \b matches a space, and end/start of line (^ or $) which means not contained in word like grill
      //song praise
      /this song/i, // NOTE: we used to also filter out just /song/ but that might be too much?
      /B[a-zA-Z]*NGER/i,

      // considered whitelist searching for JUST excitement exclamations...
      ///wo{3,}w|O{3}H|HO{1,}LY|OM[CG]{1,}|AH{4,}|OH MY |that was (so{1,})* (awesome|ama{1,}zing|incredible|nuts|sick|)/i
    ];

    let matchesAnyOfRegexFilters = (message) => {
      for (let regx of regexFilters) {
        if (regx.test(message)) {
          return true;
        }
      }
      return false;
    };

    let removedMessages = [];

    let cleanedChatLog = chatLog.filter((msg) => {
      let messageIsOk = !msg.username.match(/bot$|b0t$/i) // Remove message from bots (usernames ending in bot or b0t)
        && msg.message.length > 1 // Remove single char messages from things like "push 1 for..."
        && !matchesAnyOfRegexFilters(msg.message);

      if (!messageIsOk) {
        removedMessages.push(msg);
      }
      
      return messageIsOk;
    });

    return {
      cleanedChatLog: cleanedChatLog,
      removedMessages: removedMessages,
    };
  }

  /**
   * getClipData
   * NOTE: THERE IS NO PAGINATION like in getVods. Maybe someday
   * @param user_id - id of the user for the clips
   * @docs CLIP SCEMA https://github.com/mauricew/twitch-graphql-api/blob/master/USAGE.md
   * @docs https://github.com/streamlink/streamlink/discussions/5696#discussioncomment-7731283 downloading clips slug
   * @docs twitch-dl- Issue where downloading clips WORKING 2021 2021https://github.com/ihabunek/twitch-dl/issues/64
   * NOTE: This call includes a way to filter by period, LAST_MONTH, LAST_WEEK, maybe LAST_DAY? Can't get it working for VODs...
   * @returns {Array} of Clip data objects for a game OR user. It INCLUDES some Video objects when searching by game.
   */
  async getClipData ({
    userId=null,
    loginName=null,
    gameName=null,
    numToGet=10,
  }) {
    // if they asked for clips by userId or loginName, we pipe that to _getInfoForUsers, can't do it BY ID/login here
    if (userId || loginName) {
      return await this._getInfoForUsers({
        withNumClips: numToGet,
        // This resolves to passing either   "idList": userId   OR  "loginNameList": loginName
        [userId ? "idList" : "loginNameList"]: userId || loginName,
      });
    }
    
    let json = await new TwitchRequest_GQL({
      url: `https://gql.twitch.tv/gql`,
      method: "POST",
      json: {
        "query": `query { 
          game(name: "${gameName}") {
            name
            followersCount
            viewersCount
            clips(criteria: { period: LAST_MONTH }, first: ${numToGet} ) {
              edges {
                node {
                  id
                  title
                  viewCount
                  createdAt
                  durationSeconds
                  curator {
                    login
                  }
                  broadcaster {
                    login
                  }
                }
              }
            }
            videos(sort: VIEWS) {
              edges {
                node {
                  id
                  creator {
                    login
                  }
                  title
                  viewCount
                  createdAt
                  lengthSeconds
                  broadcastType
                }
              }
            }
          }
        }`,
        "variables":{},
      },
      name: "getClipData",
    }).runAsync();
    
    return json.data.game;
  }


  // other stuff I don't know what to do with, nor do I have plans for it

  /**
   * getVideoChapters
   * @docs https://github.com/lay295/TwitchDownloader/blob/master/TwitchDownloaderCore/TwitchHelper.cs#L1127 GetVideoChapters
   * @return ??
   */
  async getVideoChapters (vodId) {
    let json = await new TwitchRequest_GQL({
      url: `https://gql.twitch.tv/gql`,
      method: "POST",
      json: {
        "extensions": {
          "persistedQuery": {
            "sha256Hash": "8d2793384aac3773beab5e59bd5d6f585aedb923d292800119e03d40cd0f9b41",
            "version": 1
          }
        },
        "operationName": "VideoPlayer_ChapterSelectButtonVideo",
        "variables":{
          "videoID": vodId.toString(),
        }
     },
     name: "getVideoChapters",
    }).runAsync();
   
   /*
      // When a given video has only 1 chapter, data.video.moments.edges will be empty.
      var chapterResponse = responseData...
      chapterResponse.data.video.moments ??= new VideoMomentConnection { edges = new List<VideoMomentEdge>() };

      // When downloading VODs of currently-airing streams, the last chapter lacks a duration
      if (chapterResponse.data.video.moments.edges.LastOrDefault() is { } lastEdge && lastEdge.node.durationMilliseconds is 0)
      {
          lastEdge.node.durationMilliseconds = lastEdge.node.video.lengthSeconds * 1000 - lastEdge.node.positionMilliseconds;
      }

      return chapterResponse;
      */

   return json;
 }
  async GetOrGenerateVideoChapters(videoId, videoInfo) {
    let chapterResponse = await this.getVideoChapters(videoId);

    // Video has only 1 chapter, generate a bogus video chapter with the information we have available.
    if (chapterResponse.data.video.moments.edges.Count == 0) {
        chapterResponse.data.video.moments.edges.push(
            this.GenerateVideoMomentEdge(0,
              videoInfo.lengthSeconds,
              videoInfo.game && videoInfo.game.id,
              videoInfo.game && videoInfo.game.displayName,
              videoInfo.game && videoInfo.game.displayName,
              videoInfo.game && videoInfo.game.boxArtURL
            )
        );
    }

    return chapterResponse;
 }

  // @return VideoMomentEdge
  GenerateClipChapter(clipInfo) { // type: Clip
    return this.GenerateVideoMomentEdge(
      0, 
      clipInfo.durationSeconds, 
      clipInfo.game && clipInfo.game.id, 
      clipInfo.game && clipInfo.game.displayName, 
      clipInfo.game && clipInfo.game.displayName, 
      clipInfo.game && clipInfo.game.boxArtURL
    );
  }

  // @return VideoMomentEdge
  GenerateVideoMomentEdge(startSeconds, lengthSeconds, gameId=null, gameDisplayName=null, gameDescription=null, gameBoxArtUrl=null) {
    gameId = gameId || "-1";
    gameDisplayName = gameDisplayName || "Unknown";
    gameDescription = gameDescription || "Unknown";
    gameBoxArtUrl = gameBoxArtUrl || "";

    return { //new VideoMomentEdge
      node: { //new VideoMoment
        id: "",
        _type: "GAME_CHANGE",
        positionMilliseconds: startSeconds,
        durationMilliseconds: lengthSeconds * 1000,
        description: gameDescription,
        subDescription: "",
        details: { //new GameChangeMomentDetails
          game: { // new Game
            id: gameId,
            displayName: gameDisplayName,
            boxArtURL: gameBoxArtUrl.Replace("{width}", "40").Replace("{height}", "53")
          }
        }
      }
    };
  }
};

module.exports = {
  TwitchAPI_GQL: TwitchAPI_GQL,
  TwitchRequest_GQL: TwitchRequest_GQL,
};
