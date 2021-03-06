import Tippy from 'tippy.js';
import Quran from './books/quran';
import tooltipHTML from './templates/tooltip';
import DOMIterator from './lib/dom-iterator';
import I18n from './i18n';

const author = 274877906944; // Erhan Aktaş
const baseApiURL = "https://securewebserver.net/jetty/qt/rest";

/**
 * The main entry point for the reftagger of Alkotob
 */
class Reftagger {
  constructor(ctx) {
    this._initialized = false;
    this._tippy       = null;
    this._ctx         = ctx;
    this._i18n        = new I18n();
    this.quran        = new Quran;

    // Initialize the default settings for the class
    this._settings = {
      language: 'tr',
      onPageLoad: true,
      iframes: true, // From match.js
      exclude: [], // From match.js
      theme: 'alkotob', // dark, light, transparent, <custom>
    };

    // languages
    this.languages =  [
      {text : "Türkçe", value : "tr"},
      {text : "İngilizce", value : "en"},
      {text : "Arapça", value : "ar"}
    ];

    // authors
    this.authors = [];
  }

  /**
   * Utility function for accessing the settings
   */
  get settings() {
    return this._settings;
  }

  /**
   * An instance of DOMIterator
   * @type {DOMIterator}
   * @access protected
   */
  iterator(ctx) {
    return new DOMIterator(
      ctx || this._ctx || document,
      this.settings.iframes,
      this.settings.exclude
    );
  }

  /**
   * Initializes the functionality on the page, called within the library
   * for initial page load and looks for the settings variable on the page.
   */
  init() {
    const self = this;
    if (this._initialized) return;

    // Start working on the options
    let options = typeof window.refTagger !== 'undefined' ? window.refTagger : {};

    // Update the settings with user defined values
    Object.keys(options).forEach(key => {
      if (typeof self._settings[key] !== 'undefined') {
        self._settings[key] = options[key];
      }
    });

    // Override the root object
    window.refTagger = self;

    self._initDOMDependencies();

    // Tag references on page load
    if (self.settings.onPageLoad) {
      window.onload = () => {
        self.tag();

        //fetch authors
        self.getAuthors();
      }
    }

    // Update translation settings
    this._i18n.lang(this._settings.language);

    self._initialized = true;
  }

  getLanguageHTML() {
    //Create and append select list
    const select = document.createElement("select");
    select.id = "language-list";

    //Create option and append select list
    let defaultOption = document.createElement('option');
    defaultOption.text = this._i18n.get('Dil Seçiniz');
    defaultOption.value = 'all';
    select.append(defaultOption);
    select.selectedIndex = 0;

    this.languages.forEach(language =>{
      let option = document.createElement('option');
      option.innerHTML = this._i18n.get(language.text);
      option.value = language.value;
      select.append(option);
    });

    return select;
  }

  getAuthors() {
    //fetch authors on init
    fetch(baseApiURL + "/authors")
      .then((res) => { return res.json() })
      .then((authors) => {
        this.authors = authors;
      }).catch( function(err) {
      console.log(err)
    });
  }

  getSetAuthorsHTML(authors, selectHtml){
    let select;

    if(selectHtml == null) {
      select = document.createElement("select");
      select.id = "translation-list";

      select.addEventListener("mousedown", function(){
        if(select.options.length>8){
          select.size=8;
          select.style.height = '10em';
        }
      });

      select.addEventListener("change", function(){
        select.size=0;
        select.style.height = '2em';
      });

      select.addEventListener("blur", function(){
        select.size=0;
        select.style.height = '2em';
      });

    } else {
      select = selectHtml;

      //remove option items if exist
      select.options.length = 0;
    }

    //Create option and append select list
    let defaultOption = document.createElement('option');
    defaultOption.text = this._i18n.get('Meal Seçiniz');
    select.append(defaultOption);
    select.selectedIndex = 0;

    authors.forEach(author =>{
      let option = document.createElement('option');
      option.innerHTML = author.name;
      option.value = author.id;
      select.append(option);
    });

    if(selectHtml == null)
      return select;
  }

  /**
   * This is the primary init function that runs regex on the HTML to find
   * references. If a context is provided it will execute only within the
   * context, otherwise it will execute on the document body. If no context
   * is provided it will attempt to destroy previous matches so it doesn't
   * double insert.
   *
   * @param ctx Actual DOM context to perform updates
   */
  tag(ctx) {
    const self = this;
    let nodes = this._getTextNodes(ctx);

    nodes.forEach(node => {
      let references = [];

      // Parse out all the references
      references.push(...self.quran.parse(node.textContent));

      references
        .sort((a, b) => b.order - a.order) // Sort in reverse order
        .forEach(ref => this._wrapReference(node, ref));
    });

    this._initTooltips();
  }

  /**
   * Destroys all the references that have been made on the page.
   */
  destroy() {
    const references = document.querySelectorAll('.alkotob-ayah');

    // Replace them with the original text
    for (let i = 0; i < references.length; i++) {
      references[i].outerHTML = references[i].innerHTML;
    }
  }

  /**
   * Adds necessary elements to DOM
   */
  _initDOMDependencies() {
    let style = document.createElement('link');
    style.setAttribute('rel', 'stylesheet');
    style.setAttribute('type', 'text/css');
    style.setAttribute('href', 'https://quran.tr.cx/verse-reference/verse_reference.min.css');
    document.getElementsByTagName('head')[0].appendChild(style);

    // Append tooltip html
    document.body.innerHTML += tooltipHTML;
  }

  /**
   * Retrieves the text nodes that will contain references
   */
  _getTextNodes(ctx) {
    let nodes = [];

    this.iterator(ctx).forEachNode(NodeFilter.SHOW_TEXT, node => {
      nodes.push(node);
    }, node => {
      if (this._matchesExclude(node.parentNode)) {
        return NodeFilter.FILTER_REJECT;
      } else {
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    return nodes;
  }

  /**
   * Wraps the instance element and class around matches that fit the start
   * and end positions within the node
   * @param  {HTMLElement} node - The DOM text node
   * @return {Reference} Reference to replace it with
   */
  _wrapReference(node, ref) {
    const startIdx = node.textContent.indexOf(ref.text);
    if (startIdx === -1) return;

    const startNode = node.splitText(startIdx);
    const permalink = ref.permalink(baseApiURL, author);

    //console.log("permalink ", permalink)

    let refEl = document.createElement('a');
    refEl.setAttribute('href', permalink);
    refEl.setAttribute('target', '_blank');
    refEl.setAttribute('class', 'alkotob-ayah');
    refEl.setAttribute('data-text', ref.text);
    refEl.setAttribute('data-chapter', ref.chapter);
    refEl.setAttribute('data-verses', ref.verses);
    refEl.setAttribute('data-permalink', permalink);
    refEl.textContent = ref.text;

    // Get rid of actual text in following node
    startNode.textContent = startNode.textContent.replace(ref.text, '');

    // Insert it before the tailing statement
    startNode.parentNode.insertBefore(refEl, startNode);
  }

  /**
   * Checks if an element matches any of the specified exclude selectors. Also
   * it checks for elements in which no marks should be performed (e.g.
   * script and style tags) and optionally already marked elements
   * @param  {HTMLElement} el - The element to check
   * @return {boolean}
   * @access protected
   */
  _matchesExclude(el) {
    return DOMIterator.matches(el, this.settings.exclude.concat([
      // ignores the elements itself, not their childrens (selector *)
      "script", "style", "title", "head", "html"
    ]));
  }

  /**
   * Inits tooltips across the site by looping through text elements and
   * replacing it with reference tips.
   */
  _initTooltips() {
    const self = this;

    // Setup references to update elements
    const template = document.getElementById('alkotob-tooltip');
    const reference = document.getElementById('alkotob-reference');
    const verseText = document.getElementById('alkotob-verse-text');

    self._tippy = Tippy('.alkotob-ayah', {
      delay: [200,1000],
      arrow: true,
      html: '#alkotob-tooltip',
      interactive: true,
      interactiveBorder: 20, //from closing from clumsy mouse movements
      placement: 'auto',
      theme: self.settings.theme,
      //followCursor: true, //position replacement fix
      //flip: false,
      onShow() {
        //store opened item at local storage
        localStorage.setItem('tippyInstance', self._tippy);

        if (self._tippy.loading) return;
        self._tippy.loading = true;

        const el        = this._reference;
        const matchText = el.getAttribute('data-text');
        const chapter   = el.getAttribute('data-chapter');
        const verses    = el.getAttribute('data-verses');
        const permalink = el.getAttribute('data-permalink');
        //console.log("********* ",matchText," - ",chapter," - ",verses," - ",permalink)

        // Update the social media buttons
        const fb = this.querySelector('#alkotob-social-fb');
        fb.setAttribute('href', `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(permalink)}`);

        const tw = this.querySelector('#alkotob-social-tw');
        tw.setAttribute('href', `https://twitter.com/intent/tweet?original_referer=https%3A%2F%2Fkurancalis.com%3A63342%2Fkurancalis-web%2F&ref_src=twsrc%5Etfw&text=Kuran%20%C3%87al%C4%B1%C5%9F%20-%20&tw_p=tweetbutton?url=${encodeURIComponent(permalink)}&via=kurancalis`);

        const gg = this.querySelector('#alkotob-social-gg');
        gg.setAttribute('href', `https://plus.google.com/share?app=110&url=${encodeURIComponent(permalink)}&via=kurancalis`);

        const read = this.querySelector('#alkotob-readmore-link');
        const shownVerse = permalink.split("=")[2].split(",")[0];
        read.setAttribute('href', "https://kurancalis.com/#!/verse/display/" + shownVerse);
        read.innerHTML = self._i18n.get("Detaylı inceleme »");

        // Update the reference in the tooltip
        this.querySelector('#alkotob-reference').innerHTML = matchText.trim();

        const selectDIV = this.querySelector('#language-list');
        if(selectDIV == null) {
          const selectAuthors = this.querySelector("#select-authors");
          selectAuthors.appendChild(self.getLanguageHTML());
          const selectTranslations = this.querySelector("#select-translations");
          selectTranslations.appendChild(self.getSetAuthorsHTML(self.authors, null));
        }

        fetch(permalink)
          .then((res) => { return res.json() })
          .then((data) => {
            //console.log("data ",data);

            let html = Quran.render(data);

            if (!html) html = `<span>${self._i18n.get('notFound')}</span>`;
            //console.log("html ", html);

            const content = this.querySelector('#alkotob-verse-text');
            content.innerHTML = html;

            self._tippy.loading = false;

        }).catch( function(err) {
          console.log(err)
        })
      },

      onHide() {
        self._tippy.loading = false;
        localStorage.removeItem('tippyInstance');
      },

      wait: function (show, event) {
        //hide visible tooltips
        for (const popper of document.querySelectorAll('.tippy-popper')) {
          const instance = popper._tippy;

          if (instance.state.visible) {
            instance.hide()
          }
        }

        setTimeout(() => {
          // show tippy popup
          show();
        }, 0);

      },

      onHidden() {
        // Set loading spinner
        verseText.innerHTML = `<div class="sk-folding-cube">
          <div class="sk-cube1 sk-cube"></div>
          <div class="sk-cube2 sk-cube"></div>
          <div class="sk-cube4 sk-cube"></div>
          <div class="sk-cube3 sk-cube"></div>
        </div>`;
      }
    });

    //UPDATE TOOLTIP CONTENT
    document.querySelector("body").addEventListener("change", function(event) {
      let select = event.target;

      // change on language-list
      if (
        select.tagName.toLowerCase() === "select" &&
        select.id === "language-list"
      ) {

        const filteredAuthors = select.value == 'all' ? self.authors : self.authors.filter(author => author.language == select.value);
        const selectAuthorsHtml = event.target.parentNode.nextElementSibling.childNodes.item(0);

        self.getSetAuthorsHTML(filteredAuthors, selectAuthorsHtml);
      }
      // change on translation-list
      else if (
        select.tagName.toLowerCase() === "select" &&
        select.id === "translation-list"
      ) {
        let author = select.value;

        //verse references
        let verseList = [];
        let contentNode = event.target.parentNode.nextElementSibling;
        let contentNodeChilds = contentNode.childNodes;

        contentNodeChilds.forEach(x=> {
          if(x.className=="verse")
          {
            x.childNodes.forEach(y=> {

              if(y.tagName == "SUP"){

                let values = y.innerHTML.split(':');
                let chapter = parseInt(values[0]);
                let verse = parseInt(values[1]);

                verseList.push(chapter * 1000 + verse);
              }
            })
          }
        });

        let permalink = baseApiURL + '/translations/list?author=' + author + '&verse_list=' + verseList.join();

        fetch(permalink)
          .then((res) => { return res.json() })
          .then((data) => {
            let html = Quran.render(data);
            if (!html) html = `<span>${self._i18n.get('notFound')}</span>`;

            contentNode.innerHTML = html;

          }).catch( function(err) {
          console.log(err)
        })

      }
    });

    document.querySelector("body").addEventListener("click", function(event) {
      let select = event.target;

      if (
        select.tagName.toLowerCase() === "select" &&
        select.id === "translation-list"
      ) {
        //set style
        event.target.parentNode.nextElementSibling.style.minHeight = '85px';
      }
    });

    /*
     //Close tooltip on scroll
     window.addEventListener('scroll', () => {
     for (const popper of document.querySelectorAll('.tippy-popper')) {
     const instance = popper._tippy;

     if (instance.state.visible) {
     instance.popperInstance.disableEventListeners()
     instance.hide()
     }
     }
     });
     */

  }
}

// Initialize on script load
const tagger = new Reftagger();
tagger.init();

export default Reftagger;
