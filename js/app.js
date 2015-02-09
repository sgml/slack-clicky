var slackToken;
var team = localStorage.getItem('clicky-team');

// Gets current Clicky user from local storage if it exists
var user = JSON.parse(localStorage.getItem('clicky-user'));

var rooms = [];
var prettyRooms = {};
var shared = [];


function getSlackData() {

  if (localStorage.getItem('clicky-channels') !== null &&
      localStorage.getItem('clicky-groups') !== null &&
      localStorage.getItem('clicky-users') !== null) {

    buildChannelList( JSON.parse( localStorage.getItem('clicky-channels') ) );
    buildGroupsList( JSON.parse( localStorage.getItem('clicky-groups') ) );
    buildUserList( JSON.parse( localStorage.getItem('clicky-users') ) );

  } else {

    var token = localStorage.getItem('clicky-token');

    var data = {
      token: token
    };

    var roomIds = {};

    $.ajax({
      type: 'GET',
      url: 'https://slack.com/api/rtm.start',
      data: data,
      success: function(data) {
        if (data.ok === true) {

          // Channels
          var allChannels = data.channels;
          var channels = [];
          for (var i in allChannels) {
            var channel = allChannels[i];
            if (!channel.is_archived) {
              roomIds[channel.id] = channel.name;
              channel.name = '#' + channel.name;
              channels.push(channel);
            }
          }
          localStorage.setItem('clicky-channels', JSON.stringify(channels));

          // Groups
          var allGroups = data.groups;
          var groups = [];
          for (var i in allGroups) {
            var group = allGroups[i];
            if (!group.is_archived) {
              roomIds[group.id] = group.name;
              groups.push(group);
            }
          }
          localStorage.setItem('clicky-groups', JSON.stringify(groups));

          // Users
          var allUsers = data.users;
          var users = [];
          for (var i in allUsers) {
            var user = allUsers[i];
            if (!user.deleted && user.name != 'slackbot') {
              user.name = '@' + user.name;
              for (var j in data.ims) {
                var im = data.ims[j];
                if (im.user == user.id) {
                  user.im_id = im.id;
                  roomIds[im.id] = user.name;
                  break;
                }
              }
              users.push(user);
            }
          }
          // Let's take a moment to thank Slack for this next mess of for loops and if statements
          // Why is there no easy way to identify the current user's im_id!?
          // This checks though all users, finds the one which doesn't have an im_id, which must be the authed user
          // It then finds the im channel with user 'USLACKBOT' and set's it im_id to the current user
          for (var k in users) {
            var user = users[k];
            if (!user.im_id) {
              for (var l in data.ims) {
                var im = data.ims[l];
                if (im.user == 'USLACKBOT') {
                  users[k].im_id = im.id;
                  break;
                }
              }
            }
          }
          localStorage.setItem('clicky-users', JSON.stringify(users));

          localStorage.setItem('clicky-roomIds', JSON.stringify(roomIds));

          buildChannelList(channels);
          buildGroupsList(groups);
          buildUserList(users);

        } else {
          console.error('[err] Error getting Slack data: ' + data.error);
        }
      }

    });

  }

}



// Builds channel list in main interface
function buildChannelList(channels) {
  var list = $('#channelList');
  var html = '';

  if (channels.length === 0) {
    console.info('[info] No channels available');
    $('div#channels').hide();
    return;
  } else {
    $('div#channels').show();
  }

  $.each(channels, function(i) {
    var channel = channels[i];
    rooms.push(channel);
    prettyRooms[channel.id] = channel.name;
    html += '<li class="channel"><span data-type="channel" class="share-link" id="' + channel.id + '" title="' + channel.purpose.value + '" data-room="' + channel.id + '">';
    html += channel.name + '</span></li>';
  });
  list.html(html);
}


// Builds user list in main interface
function buildUserList(users) {
  var list = $('#userList');
  var html = '';

  if (users.length === 0) {
    console.info('[info] No users available');
    $('div#users').hide();
    return;
  } else {
    $('div#users').show();
  }

  $.each(users, function(i) {
    var user = users[i];
    rooms.push(user);
    prettyRooms[user.id] = user.name;
    html += '<li class="user"><span data-type="user" class="share-link" id="' + user.id + '" title="' + user.profile.real_name + '" data-room="' + user.id + '">';
    html += user.name + '</span></li>';
  });
  list.html(html);
}


// Builds group list in main interface
function buildGroupsList(groups) {
  var list = $('#groupList');
  var html = '';

  if (groups.length === 0) {
    console.info('[info] No groups available');
    $('div#groups').hide();
    return;
  } else {
    $('div#groups').show();
  }

  $.each(groups, function(i) {
    var group = groups[i];
    rooms.push(group);
    prettyRooms[group.id] = group.name;
    html += '<li class="group"><span data-type="group" id="' + group.id + '" class="share-link" title="' + group.name + '" data-room="' + group.id + '">';
    html += group.name + '</span></li>';
  });
  list.html(html);
}


// Checks that provided API key is valid
function testAuth(token) {
  var data = {
    token: token
  };

  var response = $.ajax({
    type: 'POST',
    url: 'https://slack.com/api/auth.test',
    data: data,
    async: false,
    success: function(data) {
      return data;
    }
  }).responseJSON;

  if (response.ok === true) {
    return response;
  } else {
    return false;
  }
}


// Gets active tab url
function postCurrentTabTo(channel,search) {
  chrome.tabs.query({'active': true, 'windowId': chrome.windows.WINDOW_ID_CURRENT},function(tabs) {
    var tab = tabs[0];
    var tabUrl = tab.url;

    postMessage(tabUrl, channel, search);

  });
}


// Sends link to user or channel using Slack API
function postMessage(message, channel, search) {
  var formattedMessage = '<' + message + '>';
  var data = {
    'token': slackToken,
    'channel': channel,
    'text' : '_#Clicky_: ' + formattedMessage,
    'username': '#Clicky from ' + user.name,
    'unfurl_links': true,
    'unfurl_media': true
  };
  var badge = search ? $('span.search#' + channel) : $('span#' + channel);
  badge.addClass('disabled');

  $.ajax({
    type: 'POST',
    url: 'https://slack.com/api/chat.postMessage',
    data: data,
    success: function(data) {
      var badgeText = badge.text();
      badge.removeClass('share-error');
      badge.width(badge.width()); // Fixes badge width to it's current width
      if (data.ok === true) {      
        console.info('[info] Link shared');
        $('span#' + channel).addClass('share-success').removeClass('disabled');
        shared.push(channel);

        var history = JSON.parse(localStorage.getItem('clicky-history'));
        var timestamp = new Date().getTime() / 1000;
        var roundedTimestamp = Math.floor(timestamp);
        var historyEntry = {
          url: message,
          to: prettyRooms[channel],
          timestamp: roundedTimestamp
        };
        history.push(historyEntry);
        localStorage.setItem('clicky-history', JSON.stringify(history));
        badge.html('Sent!').delay(2000).queue(function(n) {
          badge.html(badgeText);
          $('span#' + channel).addClass('share-success-no-animate').removeClass('share-success');
          n();
        });
      } else {
        var errorMsgs = {
          'channel_not_found': 'Refresh and try again',
          'is_archived': 'Refresh and try again',
          'msg_too_long': 'Please try again',
          'no_text': 'Please try again',
          'rate_limited': 'Please try again',
          'not_authed': 'Please re-login',
          'invalid_auth': 'Please re-login',
          'account_inactive': 'Please re-login'
        };
        errorMsg = errorMsgs[data.error];
        console.error('[error] Error sharing link: ' + errorMsg);
        badge.addClass('share-error').removeClass('disabled');
        badge.html('Error :(').delay(2000).queue(function(n) {
          badge.html(badgeText);
          n();
        });
        if (data.error == 'not_authed' || data.error == 'invalid_auth' || data.error == 'account_inactive') {
          localStorage.clear();
          loadView();
        }
      }          
    }
  });
}



// Deletes link to user or channel using Slack API
function deleteMessage(timestamp, channel) {
  var data = {
    'token': slackToken,
    'channel': channel,
    'ts': timestamp
  };

  $.ajax({
    type: 'POST',
    url: 'https://slack.com/api/chat.delete',
    data: data,
    success: function(data) {
      if (data.ok === true) {      
        console.info('[info] Message deleted');
      } else {
        console.error('[err] Error deleting message: ' + data.error);
      }          
    }
  });
}


// Loads correct view based on available data
function loadView() {
  // Handles list hiding
  var hiddenList;
  if (localStorage.getItem('clicky-hidden') === null) {
    hiddenList = {
      'channelList' : false,
      'userList' : false,
      'groupList' : false
    };
    localStorage.setItem('clicky-hidden', JSON.stringify(hiddenList));

  } else {
    hiddenList = JSON.parse(localStorage.getItem('clicky-hidden'));
    var keys = Object.keys(hiddenList);
    for (var i in keys) {
      if (hiddenList[keys[i]] === true) {
        var list = $('ul#' + keys[i]);
        list.hide();
        list.siblings('i').removeClass('glyphicon-chevron-up').addClass('glyphicon-chevron-down');
        list.parent('div').attr('data-visible', false);
      } 
    }
  }

  if (localStorage.getItem('clicky-first-load') === null) $('#instructions').show();

  if (localStorage.getItem('clicky-history') === null) localStorage.setItem('clicky-history', JSON.stringify([]));

  if (localStorage.getItem('clicky-token') !== null) {
    slackToken = localStorage.getItem('clicky-token');
    user = JSON.parse(localStorage.getItem('clicky-user'));
    if (localStorage.getItem('clicky-user') !== null) {
      user = JSON.parse(localStorage.getItem('clicky-user'));
      $('#api-token-view').hide();
      getSlackData();
      $('#main-view').show();
      localStorage.setItem('clicky-first-load', false);
      setTimeout(function() {
        $('#search-input').focus();
      }, 500);
    }

  } else {
    $('#main-view').hide();
    $('#api-token-view').show();
  }
}


// Deletes data in local storage and fetches new data from the Slack API
function refreshData() {
  console.info('[info] Refreshing data');
  localStorage.removeItem('clicky-users');
  localStorage.removeItem('clicky-channels');
  localStorage.removeItem('clicky-groups');
  rooms = [];
  console.info('[info] Local storage items removed');
  $('#userList').html('Loading...');
  $('#channelList').html('Loading...');
  $('#groupList').html('Loading...');  
  getSlackData();
  var token = localStorage.getItem('clicky-token');
  var auth = testAuth(token);
  if (auth === false) {
    localStorage.clear();
    loadView();
  }
}


// Handles search and filters list of rooms
function filterRooms(str) {
  var matches = [];
  $('#resultList').html('');

  for (var i in rooms) {
    var room = rooms[i];
    if (room.name.indexOf(str) >= 0 && str !== '') {
      matches.push(room);
    }
  }

  $('#rooms').hide();
  $('#search').show();
  // $('#search-form span.clear').show();
  for (var i in matches) {
    var match = matches[i];
    var html = '';
    var roomType;
    var sharedTo;
    var classes = 'share-link search';

    if ($.inArray(match.id, shared) != -1) {
      sharedTo = true;
      classes += ' share-success-no-animate';
    } else {
      sharedTo = false;
    }

    if (match.name[0] == '#') {
      roomType = 'channel_search';
    } else if (match.name[0] == '@') {
      roomType = 'user_search';
    } else {
      roomType = 'group_search';
    }

    html += '<li class="result"><span data-type="' + roomType + '" id="' + match.id + '" class="' + classes + '" title="' + match.name + '" data-room="' + match.id + '">';
    html += match.name + '</span></li>';
    $('#resultList').append(html);
  }

  if (matches.length === 0) {
    var noResultsMsg = '<li class="result"><span id="noMatches">No results found</span></li>';
    $('#resultList').append(noResultsMsg);
    if (str === '') {
      $('#rooms').show();
      $('#search').hide();
      $('#search-form span.clear').hide();
      $('#resultList').html(null);
    }
  }
}


// Searches all rooms on keyup
$('#search-input').keyup(function() {
  var str = $('#search-input').val();
  filterRooms(str.toLowerCase());
});


// Clears search input on click
$(document).on('click', '#search-results-toggle', function() {
  filterRooms('');
  $('#search-input').val('');
});


// Handles link clicks
$(document).on('click', 'a.linkable', function() {
  var href = $(this).attr('href');
  chrome.tabs.create({'url': href});
});


// Handles history button clicks
$(document).on('click', 'span#history', function() {
  var history = JSON.parse(localStorage.getItem('clicky-history'));
  var html = '';
  for (var i = history.length - 1; i >= 0; i--) {
    var entry = history[i];
    var prettyUrl = ( entry.url.split('://') )[1];
    var time = moment.unix(entry.timestamp).fromNow();
    html += '<a href="'+entry.url+'" class="linkable">';
    html += '<span class="history-moment">'+time+'</span>';
    html += '<h4 class="list-group-item-heading">'+entry.to+'</h4>';
    html += '<p>'+prettyUrl+'</p>';
    html += '</a>';
  }
  $('#history-list').html(html);
  $('#main-view').hide();
  $('#history-view').show();
});


// Handles history view 'back' button clicks
$(document).on('click', 'span#history-back', function() {
  $('#history-view').hide();
  $('#main-view').show();
});


// Handles click events on users, channels, and groups
// Shares active tab to that user/channel/group
$(document).on('click', '.share-link', function() {
  var channel = $(this).attr('data-room');
  if (!$(this).hasClass('disabled')) {
    var search = $(this).hasClass('search') ? true : false;
    postCurrentTabTo(channel, search);
  }
});


$(document).on('click', 'button#OAuth', function() {
  console.log('OAuth dance initiated');
  chrome.extension.sendRequest({msg: 'beginOAuth'});
});


// Handles click events on refresh button
// Deletes users and channels from local storage
// Gets new data and rebuilds interfaces
$(document).on('click', '#refresh-data', function() {
  refreshData();
  var icon = $(this).find(".glyphicon-refresh");
  var animateClass = 'icon-refresh-animate';

  icon.addClass(animateClass);
  window.setTimeout( function() {
    icon.removeClass( animateClass );
  }, 1000 );  
});


// Handles list toggle clicks
$(document).on('click', '.list-toggle', function() {
  var icon = $(this);
  var room = icon.parent('div');
  var visible = room.attr('data-visible');
  var toggleId = icon.attr('data-toggle');
  var list = $('#' + toggleId);

  visible = room.attr('data-visible') === 'true' ? true : false;

  var hiddenList = JSON.parse(localStorage.getItem('clicky-hidden'));

  if (visible === true) {
    list.slideUp(150);

    icon.addClass('icon-refresh-animate');
    window.setTimeout( function() {
      icon.removeClass('icon-refresh-animate glyphicon-chevron-up').addClass('glyphicon-chevron-down');
    }, 250 );

    room.attr('data-visible', false);
    hiddenList[toggleId] = true;
    localStorage.setItem('clicky-hidden', JSON.stringify(hiddenList));
  } else {
    list.slideDown(150);

    icon.addClass('icon-refresh-animate');
    window.setTimeout( function() {
      icon.removeClass('icon-refresh-animate glyphicon-chevron-down').addClass('glyphicon-chevron-up');
    }, 250 );

    room.attr('data-visible', true);
    hiddenList[toggleId] = false;    
    localStorage.setItem('clicky-hidden', JSON.stringify(hiddenList));
  }

});


// Google Analytics
var _gaq = _gaq || [];
_gaq.push(['_setAccount', 'UA-56656365-1']);
_gaq.push(['_trackPageview']);

(function() {
  var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
  ga.src = 'https://stats.g.doubleclick.net/dc.js';
  var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
})();

$(document).on('click', '.share-link', function(e) {
  var attributes = e.target.attributes;
  var type = attributes["data-type"].value;
  _gaq.push(['_trackEvent', 'shareTo_' + type, 'clicked']);
});


// Loads views when document is ready
$(document).ready(function() {
  loadView();
});
