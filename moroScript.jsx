      //Bottom of this doc sets up page structure and references components created above
      
      //These are imports from ReactRouter o.13.x
      //docs: https://github.com/rackt/react-router/blob/0.13.x/docs/guides/overview.md
      var Link = ReactRouter.Link;
      var RouteHandler = ReactRouter.RouteHandler;
      var Route = ReactRouter.Route;

      // These are endpoints to load data from.
      // Currently point to cloudant replication of lingsync data.
      // On cloudant we have a clean data view that doesn't exist on lingsync.

      // Endpoint for all up-to-date sentence data from all stories.
      var sentence_url = 'https://sande570.cloudant.com/psejenks-moro/_design/views_for_website/_view/clean_sentences';
      // Endpoint mapping story id to story name
      var story_url = 'https://sande570.cloudant.com/psejenks-moro/_design/views_for_website/_view/clean_stories';

      // Promise that is resolved once the sentence data is loaded
      var raw_data_promise = new Promise(function(resolve, reject) {
        $.ajax({
            url: sentence_url,
            dataType: 'json',
            cache: false,
            success: function(d) {
              resolve(d);
            },
            error: function(xhr, status, err) {
              console.error(sentence_url, status, err.toString());
                reject(err);}

          })
      });

      // Promise that is resolved once stories are loaded
      var story_data_promise = new Promise(function(resolve, reject) {
        $.ajax({
            url: story_url,
            dataType: 'json',
            cache: false,
            success: function(d) {
              resolve(d);
            },
            error: function(xhr, status, err) {
              console.error(sentence_url, status, err.toString());
                reject(err);}

          })
      });

      //===========================================Dictionary Code===========================================

      //Segments a word into morphemes with glosses; morphemes from 'word' argument, glosses from 'glossword' argument
      function processword(word, glossword) {
        if (!word || !glossword) {
          return []
        }
        var results = [];
        var morphemes = word.split('-');
        var glosses = glossword.split('-');
        //if there is not the same number of dashes we aren't aligning the correct morphemes and gloss
        if (morphemes.length!=glosses.length) {
          return [];
        }
        var rootindex = -1;
        //identify verb roots so we can distinguish prefixes from suffixes
        for (var i = 0; i < glosses.length; i++) {
          var gloss = glosses[i];
          //all verb root morphemes end with .rt or .aux
          //TODO: does this include be.loc, be.1d, be.2d, etc? @HSande for details
          if (_.endsWith(gloss, '.rt') || _.endsWith(gloss, '.aux')) {
            rootindex = i;
          }
        }
        //iterate over morphemes; if there is a verb root, add pre-dashes to suffixes and post-dashes to prefixes: 
        //example: g-a-s-o; clg-rtc-eat.rt-pfv = [g-, a-, s, -o]; [clg-, rtc-, eat.rt, -pfv]
        for (var i = 0; i < glosses.length; i++) {
          var gloss = glosses[i];
          var morpheme = morphemes[i];
          if (rootindex==-1) {
            results.push({moroword:morpheme, definition:gloss});
          } else {
            if (i < rootindex) {
              gloss = gloss+'-';
              morpheme = morpheme+'-';
              results.push({moroword:morpheme, definition:gloss});
            } else if (i > rootindex) {
              gloss = '-'+gloss;
              morpheme = '-'+morpheme;
              results.push({moroword:morpheme, definition:gloss});
            } else {
              results.push({moroword:morpheme, definition:gloss});
            }
          }
        }
        return results
      }

      function processdata(dirtydata){
        var results = [];
        for (var i = 0; i < dirtydata.rows.length; i++) {
          // split on spaces and remove punctuation from morphemes line
          var sentence = dirtydata.rows[i].value.sentence; 
          var presplit_morphemes = sentence.morphemes.replace(/[",.?!'()]/g, '');
          var morphemes = presplit_morphemes.split(/[ ]/);
          var gloss = sentence.gloss.split(/[ ]/);
          if (gloss.length = morphemes.length) {
            //process all morphemes and words
            for (var ii = 0; ii < gloss.length; ii++) {
              var morpheme = morphemes[ii]; 
              var glossword = gloss[ii];
              var wordresults = processword(morpheme, glossword);
              results = results.concat(wordresults);
            }
          }

        }
        //return morphemes/glosses by moro morphemes
        return _.sortBy (results, function(j) {
          return j.moroword;
        })
      }
      // This is a test for processing code
      function assert(expected_value, actual) {
        if (!_.isEqual(expected_value, actual)){
          console.error('assertion failed');
          console.error(expected_value);
          console.error(JSON.stringify(expected_value));
          console.error(actual);
          console.error(JSON.stringify(actual));

        }
      }

      function test_processdata() {
        var testcase1 = {rows:[{value:{sentence:{morphemes:'a', gloss:'A'}}}]};
        assert([{moroword:'a', definition:'A'}], processdata(testcase1));
        var testcase2 = {rows:[{value:{sentence: {morphemes:'a-b c', gloss:'A-B C'}}}]};
        assert([{moroword:'a', definition:'A'}, {moroword:'b', definition:'B'}, {moroword:'c', definition:'C'}], processdata(testcase2));
       var testcase3 = {rows:[{value:{sentence:{morphemes:'"loman-nǝŋ maj-anda l-a-fo,', gloss:'day-indef man-assoc.pl cll-rtc-past.aux'}}}]};
        assert([{moroword:'a-', definition:'rtc-'},
                {moroword:'anda', definition:'assoc.pl'},
                {moroword:'fo', definition:'past.aux'},
                {moroword:'l-', definition:'cll-'},
                {moroword:'loman', definition:'day'}, 
                {moroword:'maj', definition:'man'},
                {moroword:'nǝŋ', definition:'indef'},
                 ], processdata(testcase3));
        var testcase4 = {rows:[{value:{sentence:{morphemes:'"a,!?..', gloss:'A'}}}]};
        assert([{moroword:'a', definition:'A'}], processdata(testcase4));
        var testcase5 = {rows:[{value:{sentence:{morphemes:'b-a c', gloss:'B-A C'}}}]};
        assert([{moroword:'a', definition:'A'}, {moroword:'b', definition:'B'}, {moroword:'c', definition:'C'}], processdata(testcase5));
      } 
      test_processdata();

      // promise that resolves when sentence data is loaded and processed into morpheme dictionary
      var dictionary_data_promise = raw_data_promise.then(function(rawdata) {
        return processdata(rawdata); 
      });

      //Dictionary viewing code
      //ReactClass for rendering a definition
      var Definition = React.createClass({
        render: function() {
          return (
            <div>
              <h2>
                {this.props.moroword}
              </h2>
              {this.props.definition}
            </div>
          );
        }
      });
      // ReactClass for rendering many definitions
      var DictList = React.createClass({
        render: function() {
          var definitions=this.props.data.map(function(def) {
            return ( <Definition moroword={def['moroword']} definition={def['definition']}/> )
          });
          return (
            <div>
              {definitions}
            </div>
          );
        }
      });
      // React container that will show a loading dimmer until the dictionary data is available; then renders definitions
      var DictBox = React.createClass({
        getInitialState: function() {
          return {data: [], loaded: false};
        },
        componentDidMount: function() {
          dictionary_data_promise.then(function(dictdata) {
                this.setState({data: dictdata, loaded: true});
              }.bind(this));
        },
        render: function() {
          if (this.state.loaded) {
            return (
             <div>
                //TODO: rendering all definitions is slow, so we only render 100 for now. Add pagination before rendering all. @HSande
                Dictionary({this.state.data.length}): <DictList data={this.state.data.slice(0,100)}/>
              </div>
            );
          }
          return <div className="ui active dimmer">
                  <div className="ui text loader">Loading</div>
                 </div>
        }
      });

//===================================================Text Page==================================
      // React Class that renders list of stories with links to story content pages (w/loading dimmer)
      var TextBox = React.createClass({
        getInitialState: function() {
          return {data: [], loaded: false};
        },
        componentDidMount: function() {
          story_data_promise.then(function(rawdata){
            this.setState({data: rawdata, loaded: true});
          }.bind(this))
        },
        render: function() {
          if (this.state.loaded){
            var results = this.state.data.rows.map(function (x) {
              return <li key={x.key}><Link to='Story' params={{key: x.key}}>{x.value.name}</Link></li>

            });
            return <div><ul>{results}</ul></div>;
          }
          else {
            return <div className="ui active dimmer">
                  <div className="ui text loader">Loading</div>
                 </div>
          }
        }
      });

      //React Class for a single story view
      var StoryView = React.createClass({
        //React object state
        //
        //sentence: loaded flag and sentence data
        //story: loaded flag and story data
        //show_gloss: flag true if we show interlinear gloss lines
        getInitialState: function() {
          return {sentence: {data: [], loaded: false},
                  story: {data: [], loaded: false},
                  show_gloss: false}
        },
        //queue uploading of story and sentence data when this component is mounted
        componentDidMount: function() {
          story_data_promise.then(function(rawdata){
            this.setState({story:{data: rawdata.rows, loaded: true}});
          }.bind(this));

          raw_data_promise.then(function(rawdata){
            this.setState({sentence:{data: rawdata.rows, loaded: true}});
          }.bind(this));
        },
        //only ready to display story when story and sentence data have loaded
        loaded: function() {
          return this.state.story.loaded && this.state.sentence.loaded;
        },
        //return name of story by searching story data for this story's id
        getStory: function() {
          var arr = this.state.story.data;
          for (var i = 0; i < arr.length; i++) {
            var o = arr[i];
            if (o.key == this.props.params.key) {
              return o.value.name;
            }
          }
          return "<Unknown Story>";
        },
        //toggles interlinear gloss or not
        toggleGloss: function() {
          this.setState({show_gloss: !this.state.show_gloss});
        },
        //renders component
        render: function() {
          // If we haven't loaded yet, just render the dimmer.
          if (!this.loaded()) {
            return <div className="ui active dimmer">
              <div className="ui text loader">Loading</div>
            </div>;
          }
          // process sentence data to render alignment of morphemes/glosses and show one clause per line
          // lodash chaining: https://lodash.com/docs#_
          var sentences = _(this.state.sentence.data).filter(
            // render sentences from this story
            function(x){
              return x.value.story == this.props.params.key;
            }.bind(this)
          ).map(
            // how to render a sentence
            function(x){
              var gloss = '';
              // interlinear gloss alignment
              if (this.state.show_gloss) {
                var morphemes = x.value.sentence.morphemes.split(' ');
                var glosses = x.value.sentence.gloss.split(' ');
                var pairs = _.zip(morphemes, glosses);
                // render one inline block div containing morpheme and gloss per word
                var glosses = _(pairs).map(function(x, i){
                  var morpheme = x[0];
                  var gloss = x[1];
                  return <div style={{display: "inline-block", marginRight: "5px"}} key={i}>{morpheme}<br/>{gloss}</div>
                }.bind(this)).value();
                gloss = <span>{glosses}<br/></span>;
              }
              // render utterance and translation
              return <div key={x.key} style={{marginBottom: "10px"}}>
                <b>{x.value.sentence.utterance}</b><br/>
                {gloss}
                {x.value.sentence.translation}
              </div>
            }.bind(this)
          ).value();
          // render story content page with title and checkbox to toggle interlinear gloss display
          return (
            <div>
              <h1>{this.getStory()}</h1>
              <div style={{marginBottom: "15px"}}>Show Gloss: <input type="checkbox" checked={this.state.show_gloss} onChange={this.toggleGloss}/></div>
              {sentences}
            </div>
          );

        }
      });

      var Homepage = React.createClass(
         {render: function() {
          //TODO: add homepage content between Divs @HSande and @PJenks
          return <div> Homepage </div>
          }
         }
      )

      //render page template using ReactRouter: https://github.com/rackt/react-router/blob/0.13.x/docs/guides/overview.md
      var App = React.createClass(
        {render: function() {
          return <div className='ui container'> 
          <div className='ui secondary menu'>
            <Link className='item' to='Homepage' >Moro</Link> 
            <Link className='item' to='Dictionary' >Dictionary</Link>
            <Link className='item' to='Texts' >Texts</Link>
          </div>
          <RouteHandler/> </div>
        }

        });

      // set up routes for ReactRouter: https://github.com/rackt/react-router/blob/0.13.x/docs/guides/overview.md
      // enables the single-page web app design
      var routes = <Route handler={App}>
        <Route path = '/' handler={Homepage} name = 'Homepage' />
        <Route path = '/dict' handler={DictBox} name = 'Dictionary'/>
        <Route path = '/text' handler={TextBox} name = 'Texts' />
        <Route path = '/text/story/:key' handler={StoryView} name = 'Story' />
        </Route>;
      ReactRouter.run(
        routes, function(Handler) {
          React.render(<Handler/>, document.getElementById('content'))

        }
        );
