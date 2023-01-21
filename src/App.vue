<template lang="pug">
div
  #hdr(style="width:100%; background-color:#ccc; ")
    div(style="margin:3px 10px; display:inline-block;width:100%")
      #lbl TV Series
      input(v-model="searchStr" @input="select"
            style="border:1px solid black; width:100px;")
      button(@click="select")
        font-awesome-icon(icon="search")
      input(v-model="pkupEditName" 
            style="border:1px solid black; margin-left:20px; width:100px;"
             @change="addPickUp")
      button(@click="addPickUp") +
      button(@click="showAll" style="margin-left:20px") 
        | Show All
    div(style="width:100%;")
      table(style="background-color:white; padding:0 14px; width:100%;")
        tr  
          td(style="width:60px;font-size:large;") 
            | {{shows.length + '/' + allShowsLength}}
          td(style="width:100px;")
            button(@click="sortClick" style="width:90px; text-align:right;") Sort By:
          td(v-if="sortByDate"
             style="width:120px; text-align:left; font-size:large;") New Shows
          td(v-else-if="sortBySize" 
             style="width:120px; text-align:left; font-size:large;") Size
          td(v-else                   
             style="width:30px; text-align:left; font-size:large;") Alpha
          td(style="padding:0 4px;text-align:right;") Filters:
          td( v-for="cond in conds"
              :style="{width:'30px',textAlign:'center'}"
              @click="condFltrClick(cond)" )
            font-awesome-icon(:icon="cond.icon"
              :style="{color:condFltrColor(cond)}")

  div(style="margin-top:85px; width:100%;")
    table(style="padding:0 5px; width:100%; font-size:18px")
      tr(v-for="show in shows" key="show.Id" style="outline:thin solid;")
        td(style="width:30px; text-align:center;"
             @click="copyNameToClipboard(show)")
          font-awesome-icon(icon="copy" style="color:#ccc")
        td(style="width:30px; text-align:center;" )
          div(v-show="!show.Id.startsWith('nodb-')" 
                 @click="openSeriesMap(show)")
            font-awesome-icon(icon="border-all" style="color:#ccc")
        td(v-if="sortByDate" style="width:150px;font-size:16px;") 
          | {{ show.date }}
        td(v-if="sortBySize" style="margin-right:200px;width:60px;font-size:16px;text-align:right") 
          | {{ parseInt(show.size/1e9) + 'G&nbsp;&nbsp;&nbsp;' }}
        td(@click="showInExternal(show, $event)"
           :style="{padding:'4px', backgroundColor: highlightName == show.Name ? 'yellow' : 'white'}" :id="nameHash(show.Name)") {{show.Name}}
        td( v-for="cond in conds" 
            style="width:30px; text-align:center;"
           @click="cond.click(show)" )
          font-awesome-icon(:icon="cond.icon"
              :style="{color:condColor(show,cond)}")

  #map(v-if="mapShow !== null" 
        style="width:60%; background-color:#eee; padding:20px;")
    //- div(style="display:inline-block;")x {{mapShow.Name}} 
    div(style="margin:3px 10px; display:inline-block;")
      button(@click="gapClick(mapShow)") gap chk
      button(@click="closeSeriesMap()")  close
      | {{'&nbsp;&nbsp;&nbsp;'+mapShow.Name}}
    table(style="padding:0 5px; width:100%; font-size:16px" )
      tr(style="font-weight:bold;")
        td
        td(v-for="episode in seriesMapEpis" style="width:30px; text-align:center;"
              key="episode") {{episode}}
      tr(v-for="season in seriesMapSeasons" key="season" style="outline:thin solid;")
        td(style="font-weight:bold; width:20px; text-align:left;") {{season}}
        td(v-for="episode in seriesMapEpis" 
             :style="{width:'30px', textAlign:'center', backgroundColor:( seriesMap?.[season]?.[episode]?.missing ? '#f88' : (seriesMap?.gap?.[0] == season && seriesMap?.gap?.[1] == episode ? 'yellow' : (seriesMap?.gcs?.[0] == season && seriesMap?.gcs?.[1] == episode ? '#8f8' : 'white') ) ) }"
           key="episode")
          span(v-if="seriesMap?.[season]?.[episode]?.played")  w
          span(v-if="seriesMap?.[season]?.[episode]?.avail")   +
          span(v-if="seriesMap?.[season]?.[episode]?.missing") -
          span(v-if="seriesMap?.[season]?.[episode]?.unaired") u
</template>


<script>
import * as emby           from "./emby.js";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { library }         from "@fortawesome/fontawesome-svg-core";
import { faLaughBeam, faSadCry, faClock, faHeart, } 
                           from "@fortawesome/free-regular-svg-icons"; 
import { faCheck, faPlus, faMinus, faArrowDown, 
         faTv, faSearch, faQuestion, faCopy, faBorderAll, faBan} 
                           from "@fortawesome/free-solid-svg-icons";
library.add([  
  faLaughBeam, faSadCry, faClock, faHeart, faCheck, faPlus, 
  faMinus, faArrowDown, faTv, faSearch, faQuestion, faCopy, 
  faBan, faBorderAll, ]);
 
let allShows = [];
let dates = null;
let recentDates = null;
let embyWin = null;
let imdbWin = null;

export default {
  name: "App",
  components: { FontAwesomeIcon },
  data() {
    const dataGapClick = async (show) => {
      this.gapClick(show);
    };

    const toggleFavorite = async (show) => {
      this.saveVisShow(show.Name);
      show.IsFavorite = await emby.toggleFav(show.Id, show.IsFavorite);
      // if (show.Id.startsWith("nodb-")) console.log(show);
    };

    const toggleReject = async (show) => {
      this.saveVisShow(show.Name);
      show.Reject = await emby.toggleReject(show.Name, show.Reject);
      if (!show.Reject && show.Id.startsWith("nodb-")) {
        console.log("toggled reject, removing row");
        const id = show.Id;
        allShows   = allShows.filter(  (show) => show.Id != id);
        this.shows = this.shows.filter((show) => show.Id != id);
      }
    };

    const togglePickup = async (show) => {
      this.saveVisShow(show.Name);
      show.Pickup = await emby.togglePickUp(show.Name, show.Pickup);
      if (!show.Pickup && show.Id.startsWith("nodb-")) {
        console.log("toggled pickUp, removing row");
        const id = show.Id;
        allShows   = allShows.filter(  (show) => show.Id != id);
        this.shows = this.shows.filter((show) => show.Id != id);
      }
    };

    const toggleToTry = async (show) => {
      this.saveVisShow(show.Name);
      show.InToTry = await emby.toggleToTry(show.Id, show.InToTry);
    };

    const deleteShowFromEmby = async (show) => {
      this.saveVisShow(show.Name);
      console.log("delete Show From Emby:", show.Name);
      if (!window.confirm(`Do you really want to delete series ${show.Name} from Emby?`))
        return;
      const id = show.Id;
      const res = await emby.deleteShowFromEmby(id);
      if (res != "ok") return;
      if (show.Pickup || show.Reject) {
        delete show.Genres;
        show.RunTimeTicks = 0;
        show.UnplayedItemCount = 0;
        show.IsFavorite = false;
        show.Id = "nodb-" + Math.random();
        console.log("deleted db, keeping row");
      } else {
        console.log("deleted db, removing row");
        allShows   = allShows.filter(  (show) => show.Id != id);
        this.shows = this.shows.filter((show) => show.Id != id);
        this.scrollSavedVisShowIntoView();
      }
    };

    return {
      shows:            [],
      searchStr:        "",
      pkupEditName:     "",
      sortByDate:    false,
      sortBySize:    false,
      highlightName:    "",
      allShowsLength:    0,
      mapShow:        null,
      seriesMapSeasons: [],
      seriesMapEpis:    [],
      seriesMap:        {},

      conds: [ {
          color: "teal", filter: 0, icon: ["far", "laugh-beam"],
          cond(show)  { return show.Genres?.includes("Comedy"); },
          click(show) {},
        }, {
          color: "blue", filter: 0, icon: ["far", "sad-cry"],
          cond(show)  { return show.Genres?.includes("Drama"); },
          click(show) {},
        },
        {
          color: "#0cf", filter: 0, icon: ["fas", "plus"],
          cond(show)  { return show.UnplayedItemCount > 0; },
          click(show) {},
        }, {
          color: "#f88", filter: 0, icon: ["fas", "minus"],
          cond(show)  { return !!show.gap; },
          click(show) { dataGapClick(show); },
        }, {
          color: "lime", filter: 0, icon: ["fas", "question"],
          cond(show)  { return show.InToTry; },
          click(show) { toggleToTry(show); },
        }, {
          color: "red", filter: 0, icon: ["far", "heart"],
          cond(show)  { return show.IsFavorite; },
          click(show) { toggleFavorite(show); },
        }, {
          color: "red", filter: -1, icon: ["fas", "ban"],
          cond(show)  { return show.Reject; },
          click(show) { toggleReject(show); },
        }, {
          color: "#5ff", filter: 0, icon: ["fas", "arrow-down"],
          cond(show)  { return show.Pickup; },
          click(show) { togglePickup(show); },
        }, {
          color: "#a66", filter: 0, icon: ["fas", "tv"],
          cond(show)  { return !show.Id.startsWith("nodb-"); },
          click(show) { deleteShowFromEmby(show); },
        },
      ],
    };
  },

  /////////////  METHODS  ////////////
  methods: {

    async gapClick(show) {
      this.saveVisShow(show.Name);
      if (show.gap) {
        await emby.setGapChkStart(show.Name, show.gap);
        show.gapChkStart = show.gap;
        const gap = await emby.findGap(show.Name, show.Id);
        if(gap) {
          show.gap = gap;
          console.log("updated gap", { series: show.Name, gap});
        }
        else {
          delete show.gap;
          console.log("deleted gap in", show.Name);
        }
      }
      this.openSeriesMap(show);
    },

    nameHash(name) {
      this.allShowsLength = allShows.length;
      if(!name) {
        console.log('nameHash name param null', {name});
        console.trace();
      }
      return (
        "name-" +
        name
          .toLowerCase()
          .replace(/^the\s/, "")
          .replace(/[^a-zA-Z0-9]*/g, "")
      );
    },

    saveVisShow(name) {
      const hash = this.nameHash(name);
      console.log(`saving ${hash} as last visible show`);
      this.highlightName = name;
      window.localStorage.setItem("lastVisShow", name);
    },

    async sortClick() {
      if (this.sortBySize) this.sortBySize = false;
      else if (this.sortByDate) {
        this.sortByDate   = false;
        this.sortBySize = true;
        if (!recentDates) {
          recentDates = await emby.recentDates();
          console.log("loaded recentDates", recentDates);
          for (let show of allShows) {
            const recentDateSize = 
                recentDates[this.nameHash(show.Name)]?.split('|');
            if (!recentDateSize) {
              show.recentDate = "01/01/01";
              show.size = 0;
            }
            else [show.recentDate, show.size] = recentDateSize;
          }
        }
      } else {
        this.sortByDate = true;
        if (!dates) {
          dates = await emby.loadDates();
          console.log("loaded dates", dates);
          for (let show of allShows) {
            show.date = dates[this.nameHash(show.Name)];
            if (!show.date) show.date = "01/01/01";
            // console.log(show.date);
          }
        }
      }
      this.sortShows();
      this.showAll();
    },

    scrollSavedVisShowIntoView() {
      this.shows = allShows;
      this.$nextTick(() => {
        const name = window.localStorage.getItem("lastVisShow");
        const id = this.nameHash(name);
        this.highlightName = name;
        console.log(`srolling ${id} into view`);
        const ele = document.getElementById(id);
        if (ele) {
          ele.scrollIntoView(true);
          const hdrEle = document.getElementById("hdr");
          window.scrollBy(0, -80);
        } else {
          console.log(`show ${id} not in show list, finding nearest match`);
          for (let show of allShows) {
            const hash = this.nameHash(show.Name);
            if (hash > id) {
              const ele = document.getElementById(hash);
              if (ele) {
                ele.scrollIntoView(true);
                window.scrollBy(0, -160);
                this.saveVisShow(show.Name);
              }
              break;
            }
          }
        }
      });
    },

    copyNameToClipboard(show) {
      console.log(`copying ${show.Name} to clipboard`);
      navigator.clipboard.writeText(show.Name);
      this.saveVisShow(show.Name);
    },

    async openSeriesMap(show) {
      if(this.mapShow == show) {
        this.mapShow = null;
        return;
      }
      this.mapShow           = show;
      const seriesMapSeasons = [];
      const seriesMapEpis    = [];
      const seriesMap        = {gap:show.gap, gcs:show.gapChkStart};
      const seriesMapIn      = await emby.getSeriesMap(show.Name, show.Id);
      console.log({seriesMapGap:seriesMap.gap});
      for(const season of seriesMapIn) {
        const [seasonNum, episodes] = season;
        // console.log({seasonNum, episodes});
        seriesMapSeasons[seasonNum] = seasonNum;
        const seasonMap = {};
        seriesMap[seasonNum] = seasonMap;
        for(const episode of episodes) {
          let [episodeNum, [played, avail, unaired]] = episode;
          seriesMapEpis[episodeNum] = episodeNum;
          const missing = (!played && !avail && !unaired);
          avail = avail && !played;
          seasonMap[episodeNum] = {played, avail, missing, unaired};
        }
      }
      this.seriesMapSeasons = seriesMapSeasons.filter( 
                                x => x !== null && x !== null);
      this.seriesMapEpis    = seriesMapEpis.filter( 
                                x => x !== null && x !== null).unshift('');
      this.seriesMap = seriesMap;
      console.log({thisSeriesMapGap:this.seriesMap.gap});

      this.saveVisShow(show.Name);
    },

    closeSeriesMap() {
      this.mapShow = null;
    },

    condFltrClick(cond) {
      if (++cond.filter == 2) cond.filter = -1;
      this.select();
    },

    condFltrColor(cond) {
      switch (cond.filter) {
        case  0: return "gray";
        case -1: return "pink";
        case +1: return cond.color;
      }
    },

    sortShows() {
      allShows.sort((a, b) => {
        if (this.sortByDate) return a.date > b.date ? -1 : +1;
        // else if (this.sortBySize) return a.recentDate > b.recentDate ? -1 : +1;
        else if (this.sortBySize) 
          return parseInt(a.size) > parseInt(b.size) ? -1 : +1;
        else {
          const aname = a.Name.replace(/The\s/i, "");
          const bname = b.Name.replace(/The\s/i, "");
          return aname.toLowerCase() > bname.toLowerCase() ? +1 : -1;
        }
      });
    },

    addPickUp() {
      const name = this.pkupEditName;
      if (allShows.some((show) => show.Name == name)) {
        console.log("addPickUp: skipping duplicate show name", name);
        return;
      }
      if (name && emby.addPickUp(name)) {
        allShows.push({
          Name: name,
          Pickup: true,
          Id: "nodb-" + Math.random(),
        });
        this.highlightName = name;
        this.sortShows();
        this.saveVisShow(name);
        this.scrollSavedVisShowIntoView();
        console.log("added pickup", name);
      }
      this.pkupEditName = "";
    },

    condColor(show, cond) {
      if (cond.cond(show)) return cond.color;
      return "#ddd";
    },

    select() {
      const srchStrLc = this.searchStr == "" ? null : this.searchStr.toLowerCase();
      console.log('this.shows.length before', this.shows.length);
      this.shows = allShows.filter((show) => {
        if (srchStrLc && !show.Name.toLowerCase().includes(srchStrLc)) return false;
        for (let cond of this.conds) {
          if ( cond.filter ===  0) continue;
          if ((cond.filter === +1) != (!!cond.cond(show))) return false;
        }
        return true;
      });
      console.log('this.shows.length after', this.shows.length, this);
      this.scrollSavedVisShowIntoView();
    },

    /////////////////  UPDATE METHODS  /////////////////
    showAll() {
      this.searchStr = "";
      for (let cond of this.conds) cond.filter = 0;
      if(!this.sortByDate && !this.sortBySize) {
        const banCond = this.conds[this.conds.length-3];
        banCond.filter = -1;
      }
      this.scrollSavedVisShowIntoView();
      this.select();
    },

    async showInExternal(show, event) {
      console.log("showInExternal", show);
      this.saveVisShow(show.Name);
      if (!show.Id.startsWith("nodb-")) {
        if (event.ctrlKey) {
          if (imdbWin) imdbWin.close();
          const providers = await emby.providers(show);
          if (providers?.Imdb) {
            const url = `https://www.imdb.com/title/${providers.Imdb}`;
            imdbWin = window.open(url, "imdbWebPage");
          }
        } else {
          if (embyWin) embyWin.close();
          embyWin = window.open(emby.embyPageUrl(show.Id), "embyWebPage");
        }
      }
    },
  },

  /////////////////  MOUNTED  /////////////////
  mounted() {
    (async () => {
      await emby.init();
      allShows = await emby.loadAllShows();
      this.shows = allShows;
      const name = window.localStorage.getItem("lastVisShow");
      let lastVisShow;
      if(name) lastVisShow = this.nameHash(name);
      if (!name || !lastVisShow) {
        const name = allShows[0].Name;
        this.highlightName = name;
        this.saveVisShow(name);
      } else this.scrollSavedVisShowIntoView();

      const banCond = this.conds[this.conds.length-3];
      banCond.filter = -1;
      this.select();
    })();
  },
};
</script>
<style>
tr:nth-child(even) {
  background-color: #f4f4f4;
}
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-size:large;
}
input {
  font-size:18px;
}
button {
  font-size:18px;
}
#hdr {
  border: 1px solid black;
  position: fixed;
  left: 0;
  top: 0;
}
#map {
  border: 1px solid black;
  position: fixed;
  left: 50px;
  top: 100px;
}

#lbl {
  display: inline-block;
  margin-right: 10px;
  font-size: 16px;
  margin-right: 20px;
  font-weight: bold;
  color: blue;
}
</style>
