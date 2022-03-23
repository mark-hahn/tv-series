import axios from "axios"

const markUsrId = "894c752d448f45a3a1260ccaabd0adff";
const authHdr = 'UserId="894c752d448f45a3a1260ccaabd0adff", ' +
                'Client="MyClient", Device="myDevice", '      +
                'DeviceId="123456", Version="1.0.0"';
const fields = ['Name', 'Id', 'IsFavorite', 'Played',
                'RunTimeTicks', 'UnplayedItemCount', "DateCreated", "ExternalUrls",
                "Genres","Overview","Path","People","PremiereDate"];
let token = '';

const getToken = async (name, pwd) => {
  const config = {
    method: 'post',
    url: "http://hahnca.com:8096" +
         "/emby/Users/AuthenticateByName" +
         "?api_key=ba7d62f79cbd4a539b675b05b5663607",
    headers: { Authorization: authHdr },
    data: { Username: name, Pw: pwd },
  };
  const showsRes = await axios(config);
  token = showsRes.data.AccessToken;
}

export async function providers (show) {
  const url = `http://hahnca.com:8096/emby/Items?Recursive=true&Fields=ProviderIds&Ids=${show.Id}&api_key=ba7d62f79cbd4a539b675b05b5663607`;
  const item = (await axios.get(url)).data.Items[0];
  console.log("providers", {url, show, item});
  return item?.ProviderIds;
}

let gapChkStarts;

export async function init() {
  await getToken('MARK', '90-NBVcvbasd');
  gapChkStarts = (await axios.get('http://hahnca.com/tv/gapChkStarts.json')).data;
}

export const setGapChkStart = async (series, gapChkStart) => {
  gapChkStarts[series]   = gapChkStart;
  const [gcsSea, gcsEpi] = gapChkStart;
  const config = {
    method: 'post',
    url: `http://hahnca.com/tv/gapChkStart/${series}/${gcsSea}/${gcsEpi}`
  };
  await axios(config);
}

export async function loadDates() {
  return (await axios.get(
        'http://hahnca.com/tv/folderDates')).data;
}

export async function recentDates() {
  return (await axios.get(
        'http://hahnca.com/tv/recentDates')).data;
}

export const getSeriesMap = async (series, seriesId) => { 
  const seriesMap = [];
  const seasonsRes = await axios.get(childrenUrl(seriesId));
  for(let key in seasonsRes.data.Items) {
    let item = seasonsRes.data.Items[key];
    const season = +item.IndexNumber;
    const unaired = {};
    const unairedRes = await axios.get(childrenUrl(item.Id, true));
    for(let key in unairedRes.data.Items) {
      let item = unairedRes.data.Items[key];
      const episode = +item.IndexNumber;
      unaired[episode] = true;
    }
    const episodes = [];
    const episodeRes = await axios.get(childrenUrl(item.Id));
    for(let key in episodeRes.data.Items) {
      let item = episodeRes.data.Items[key];
      const episode = +item.IndexNumber;
      episodes.push( [episode, [ !!item?.UserData?.Played, 
                                   item?.LocationType != "Virtual",
                                 !!unaired[episode] ] ]);
    }
    seriesMap.push([season, episodes]);
  }
  return seriesMap;
}

export const findGap = async (series, seriesId) => { 
  const [gcsSea, gcsEpi] = gapChkStarts[series] || [-1,-1];
  let haveNotAvail = false;

  const seasonsRes = await axios.get(childrenUrl(seriesId));
  for(let key in seasonsRes.data.Items) {
    let item = seasonsRes.data.Items[key];
    const season = +item.IndexNumber;
    if(season < gcsSea) continue;

    const episRes = await axios.get(childrenUrl(item.Id));
    for(let key in episRes.data.Items) {
      let item = episRes.data.Items[key];
      const episode = +item.IndexNumber;
      if(season == gcsSea && episode < gcsEpi) continue;

      const avail = (item?.UserData?.Played || item.LocationType != "Virtual");
      if(!avail) haveNotAvail = true;
      else if(haveNotAvail) {
        console.log( `found gap in ${series}, S${season}E${episode}`);
        return([season,episode]);
      }
    }
  }
  return null;
}

export async function loadAllShows() {
  console.log('entering loadAllShows');
  const showsRes = await axios.get(showListUrl());
  const shows = [];
  for(let key in showsRes.data.Items) {
    let item = showsRes.data.Items[key];
    Object.assign(item, item.UserData);
    delete item.UserData;
    for(const k of ['DateCreated', 'PremiereDate'])
      if(item[k]) item[k] = item[k].replace(/T.*/, '');
    // if(item.ExternalUrls.length > 0)
    //   console.log(item.Name, item.ExternalUrls);
    const gap = await findGap(item.Name, item.Id);
    if(gap) item.gap = gap;
    const gapChkStart = gapChkStarts[item.Name];
    if(gapChkStart) item.gapChkStart = gapChkStart;
    shows.push(item);
  }
  const showNames = shows.map(show => show.Name);
  const rejects = (await axios.get(
        'http://hahnca.com/tv/rejects.json')).data;
  for(let reject of rejects) {
    let gotReject = false;
    for(let showName of showNames) {
      if(showName == reject) {
        const show = shows.find(show => show.Name == showName);
        show.Reject = true;
        gotReject = true;
      }
    }
    if(!gotReject) {
      shows.push( {
        Name:  reject,
        Reject:true,
        Id:   'nodb-' + Math.random(),
      });
    }
  }
  const pickups = (await axios.get(
        'http://hahnca.com/tv/pickups.json')).data;
  for(let pickup of pickups) {
    let gotPickup = false;
    for(let showName of showNames) {
      if(showName == pickup) {
        const show = shows.find(show => show.Name == showName);
        show.Pickup = true;
        gotPickup = true;
      }
    }
    if(!gotPickup) {
      shows.push( {
        Name:  pickup,
        Pickup:true,
        Id:   'nodb-' + Math.random(),
      });
    }
  }
  const collRes = await axios.get(toTryListUrl());
  const collIds = [];
  for(let item of collRes.data.Items)
    collIds.push(item.Id);
  for(let show of shows)
    show.InToTry = collIds.includes(show.Id);

  shows.sort((a,b) => {
    const aname = a.Name.replace(/The\s/i, '');
    const bname = b.Name.replace(/The\s/i, '');
    return (aname.toLowerCase() > bname.toLowerCase() ? +1 : -1);
  });
  console.log('all shows loaded');
  return shows;
}

export async function toggleFav(id, isFav) {
  const config = {
    method: (isFav ? 'delete' : 'post'),
    url:     favoriteUrl(id),
  };
  let favRes;
  try { favRes = await axios(config); }
  catch (e) { return isFav; }
  return (favRes.status == 200 ? favRes.data.IsFavorite : isFav);
}

export async function addReject(name) {
  if(name == "") return false;
  const config = {
    method: 'post',
    url: `http://hahnca.com/tv/rejects/` + encodeURI(name),
  };
  let rejectRes;
  let err = null;
  try { rejectRes = await axios(config); }
  catch (e) { err = e.message; }
  if(err || rejectRes?.data !== 'ok') {
    if(!err) err = rejectRes?.data;
    alert('Error: unable to add reject to server. ' +
          'Please tell mark.\n\nError: ' + err);
    return false;
  }
  return true;
}

export async function addPickUp(name) {
  if(name == "") return false;
  const config = {
    method: 'post',
    url: `http://hahnca.com/tv/pickups/` + encodeURI(name),
  };
  let pickUpRes;
  let err = null;
  try { pickUpRes = await axios(config); }
  catch (e) { err = e.message; }
  if(err || pickUpRes?.data !== 'ok') {
    if(!err) err = pickUpRes?.data;
    alert('Error: unable to add pickup to server. ' +
          'Please tell mark.\n\nError: ' + err);
    return false;
  }
  return true;
}

export async function toggleReject(name, reject) {
  const config = {
    method: (reject ? 'delete' : 'post'),
    url:    `http://hahnca.com/tv/rejects/` + encodeURI(name),
  };
  let rejectRes;
  try { rejectRes = await axios(config); }
  catch (e) { return reject; }
  if(rejectRes.data !== 'ok') {
    alert('Error: unable to save change to server. ' +
          'Please tell mark.\n\nError: ' + rejectRes.data);
    return reject;
  }
  else {
    return !reject;
  }
}

export async function togglePickUp(name, pickup) {
  const config = {
    method: (pickup ? 'delete' : 'post'),
    url:    `http://hahnca.com/tv/pickups/` + encodeURI(name),
  };
  let pickUpRes;
  try { pickUpRes = await axios(config); }
  catch (e) { return pickup; }
  if(pickUpRes.data !== 'ok') {
    alert('Error: unable to save change to server. ' +
          'Please tell mark.\n\nError: ' + pickUpRes.data);
    return pickup;
  }
  else {
    return !pickup;
  }
}

export async function deleteShowFromEmby(id) {
  const delRes = await axios.delete(deleteShowUrl(id));
  const res = delRes.status;
  let err = 'ok';
  if(res != 204) {
    err = 'Error: unable to delete show. ' +
          'Please tell mark.\n\nError: ' + delRes.data;
    alert(err);
  }
  return err;
}

export async function toggleToTry(id, inToTry) {
  const config = {
    method: (inToTry ? 'delete' : 'post'),
    url:     toTryUrl(id),
  };
  let toTryRes;
  try { toTryRes = await axios(config); }
  catch (e) {  
    console.log(
        `Error toggleToTry, id:${id}, inToTry:${inToTry}`);
    return inToTry; 
  } 
  if(toTryRes.status !== 204) return inToTry;
  console.log(`toggled inToTry to ${!inToTry}`);
  return !inToTry;
}


/////////////////////  URLS  ///////////////////////
function showListUrl (startIdx=0, limit=10000) {
  return `http://hahnca.com:8096 / emby
      / Users / 894c752d448f45a3a1260ccaabd0adff / Items
    ?SortBy=SortName
    &SortOrder=Ascending
    &IncludeItemTypes=Series
    &Recursive=true
    &Fields= Name              %2c Id                %2c
             IsFavorite        %2c Played            %2c 
             UnplayedItemCount %2c DateCreated       %2c 
             ExternalUrls      %2c Genres            %2c 
             Overview          %2c Path              %2c 
             People            %2c PremiereDate      %2c 
             IsUnaired
    &StartIndex=${startIdx}
    &ParentId=4514ec850e5ad0c47b58444e17b6346c
    &Limit=${limit}
    &X-Emby-Token=${token}
  `.replace(/\s*/g, "");
}

function childrenUrl (parentId = '', unAired = false) {
  return `http://hahnca.com:8096 / emby
      / Users / 894c752d448f45a3a1260ccaabd0adff / Items /
    ?ParentId=${parentId}
    ${unAired ? '&IsUnaired = true' : ''}
    &X-Emby-Token=${token}
  `.replace(/\s*/g, "");
}

function favoriteUrl (id) {
  return encodeURI(`http://hahnca.com:8096 / emby
          / Users / 894c752d448f45a3a1260ccaabd0adff 
          / FavoriteItems / ${id}
    ?X-Emby-Client=Emby Web
    &X-Emby-Device-Name=Chrome
    &X-Emby-Device-Id=f4079adb-6e48-4d54-9185-5d92d3b7176b
    &X-Emby-Client-Version=1.0.0
    &X-Emby-Token=${token}
  `.replace(/\s*/g, ""));
}

function deleteShowUrl(id) {
  return `http://hahnca.com:8096 / emby / Items / ${id}
    ?X-Emby-Client=EmbyWeb
    &X-Emby-Device-Name=Chrome
    &X-Emby-Device-Id=f4079adb-6e48-4d54-9185-5d92d3b7176b
    &X-Emby-Client-Version=4.6.4.0
    &X-Emby-Token=${token}
  `.replace(/\s*/g, "");
}

export function embyPageUrl(id) {
  return `http://hahnca.com:8096 / web / index.html #! / item
    ?id=${id}&serverId=ae3349983dbe45d9aa1d317a7753483e
    `.replace(/\s*/g, "");
}

function toTryListUrl() {
  return `http://hahnca.com:8096 / emby / Users / 
          894c752d448f45a3a1260ccaabd0adff / Items
    ?ParentId=1468316
    &ImageTypeLimit=1
    &Fields=PrimaryImageAspectRatio,ProductionYear,CanDelete
    &EnableTotalRecordCount=false
    &X-Emby-Client=EmbyWeb
    &X-Emby-Device-Name=Chrome
    &X-Emby-Device-Id=f4079adb-6e48-4d54-9185-5d92d3b7176b
    &X-Emby-Client-Version=4.6.4.0
    &X-Emby-Token=${token}
  `.replace(/\s*/g, "");
}

function toTryUrl(id) {
  return `http://hahnca.com:8096 / emby / 
          Collections / 1468316 / Items
    ?Ids=${id}
    &userId=894c752d448f45a3a1260ccaabd0adff
    &X-Emby-Client=Emby Web
    &X-Emby-Device-Name=Chrome
    &X-Emby-Device-Id=f4079adb-6e48-4d54-9185-5d92d3b7176b
    &X-Emby-Client-Version=4.6.4.0
    &X-Emby-Token=${token}
  `.replace(/\s*/g, "");
}

/*

[
  {
    "Name": "to-try",
    "ServerId": "ae3349983dbe45d9aa1d317a7753483e",
    "Id": "1468316",
    "CanDelete": true,
    "IsFolder": true,
    "Type": "BoxSet",
    "UserData": {
      "PlaybackPositionTicks": 0,
      "PlayCount": 0,
      "IsFavorite": false,
      "Played": false
    },
    "PrimaryImageAspectRatio": 0.6666666666666666,
    "ImageTags": {
      "Primary": "f12fa256e8dd75df8c74fd3e27e91a5c"
    },
    "BackdropImageTags": []
  }
]

------      get items in TO-TRY collection  -----------
http://hahnca.com:8096/emby/Users/894c752d448f45a3a1260ccaabd0adff/Items?ParentId=1468316&ImageTypeLimit=1&Fields=PrimaryImageAspectRatio,ProductionYear,CanDelete&EnableTotalRecordCount=false&X-Emby-Client=Emby Web&X-Emby-Device-Name=Chrome&X-Emby-Device-Id=f4079adb-6e48-4d54-9185-5d92d3b7176b&X-Emby-Client-Version=4.6.4.0&X-Emby-Token=1e2f0f8dec6c4e039eaaa9657438bb6d

------      add item to TO-TRY collection  -----------
Id: "4487588"
Name: "Yellowstone (2018)"

POST
http://hahnca.com:8096/emby/Collections/1468316/Items?Ids=4487588&userId=894c752d448f45a3a1260ccaabd0adff&X-Emby-Client=Emby Web&X-Emby-Device-Name=Chrome&X-Emby-Device-Id=f4079adb-6e48-4d54-9185-5d92d3b7176b&X-Emby-Client-Version=4.6.4.0&X-Emby-Token=1e2f0f8dec6c4e039eaaa9657438bb6d

------      delete item from TO-TRY collection  -----------
Id: "3705964"
Name: "Cleaning Up"

DELETE
http://hahnca.com:8096/emby/Collections/1468316/Items?Ids=3705964&X-Emby-Client=Emby Web&X-Emby-Device-Name=Chrome&X-Emby-Device-Id=f4079adb-6e48-4d54-9185-5d92d3b7176b&X-Emby-Client-Version=4.6.4.0&X-Emby-Token=1e2f0f8dec6c4e039eaaa9657438bb6d



AirDays: []
BackdropImageTags: ["dd2d6479fc843d9a6e834d3f3f965ffe"]
CanDelete: true
CanDownload: false
ChildCount: 3
CommunityRating: 7.3
DateCreated: "2019-06-26T01:35:06.0000000+00:00"
DisplayOrder: "Aired"
DisplayPreferencesId: "f63033ff6886ecc7083a696cbeced1b0"
Etag: "9a9388246d4af7828bfbec6e79edb3ed"
ExternalUrls: [{Name: "IMDb", Url: "https://www.imdb.com/title/tt6794990"},…]
GenreItems: [{Name: "Drama", Id: 7765}, {Name: "Crime", Id: 8388}, {Name: "Thriller", Id: 8389},…]
Genres: ["Drama", "Crime", "Thriller", "Mystery"]
Id: "303167"
ImageTags: {Banner: "e9f06826b638082dae77c1d187499040", Primary: "2d368c7e7552efb69c25b57e4149b2ab",…}
IsFolder: true
LocalTrailerCount: 0
LockData: false
LockedFields: []
Name: "Absentia"
OfficialRating: "TV-MA"
Overview: "While hunting one of Boston's most notorious serial killers, an FBI agent disappears without a trace and is declared dead. Six years later, she is found in a cabin in the woods, barely alive and with no memory of the years she was missing. Returning home to learn her husband has remarried and her son is being raised by another woman, she soon finds herself implicated in a new series of murders."
ParentId: "5"
Path: "/mnt/media/tv/Absentia"
People: [{Name: "Stana Katic", Id: "776879", Role: "Emily Byrne", Type: "Actor",…},…]
PlayAccess: "Full"
PremiereDate: "2017-09-25T07:00:00.0000000+00:00"
PresentationUniqueKey: "330500-en-4514ec850e5ad0c47b58444e17b6346c"
PrimaryImageAspectRatio: 0.68
ProductionYear: 2017
ProviderIds: {Tvdb: "330500", Imdb: "tt6794990"}
RecursiveItemCount: 20
RemoteTrailers: []
RunTimeTicks: 27000000512
ServerId: "ae3349983dbe45d9aa1d317a7753483e"
SortName: "Absentia"
Studios: [{Name: "AXN", Id: 776890}]
SupportsSync: true
TagItems: []
Taglines: []
Type: "Series"
UserData: {
  IsFavorite: false
  PlayCount: 0
  PlaybackPositionTicks: 0
  Played: false
  PlayedPercentage: 5
  UnplayedItemCount: 19
}
*/