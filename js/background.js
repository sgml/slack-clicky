var activePings = [];
var socket;

function getParams(url) {
  var paramsObj = {};
  var splitUrl = url.split('?');
  var paramString = splitUrl[1];
  var params = paramString.split('&');
  for (var i in params) {
    var param = params[i];
    var array = param.split('=');
    var key = array[0];
    var value = array[1];
    paramsObj[key] = value;
  }
  return paramsObj;
}

// Gets authenticated user data from API
function getUserData(user, token) {
  var data = {
    token: token,
    user: user
  };

  var response = $.ajax({
    type: 'POST',
    url: 'https://slack.com/api/users.info',
    data: data,
    async: false,
    success: function(data) {
      return data;
    }
  }).responseJSON;

  if (response.ok === true) {
    return response.user;
  } else {
    return false;
  }
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


// Submits and tests entered API token
function submitToken(token) {
  var auth = testAuth(token);

  if (auth === false) {
    console.info('[info] Authenticated failed');
    return false;
  } else {
    var team = auth.team;
    var user_id = auth.user_id;
    var authUser = getUserData(user_id, token);
    localStorage.setItem('clicky-user', JSON.stringify(authUser));
    localStorage.setItem('clicky-token', token);
    localStorage.setItem('clicky-team', team);
    return true;
  }
}


function exchangeSlackCode(data) {

  $.ajax({
    type: 'POST',
    url: 'https://slack.com/api/oauth.access',
    data: data,
    success: function(data) {
      if (data.ok === true) {
        submitToken(data.access_token);
      }
    }
  });
}


function generateState() {

  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i=0; i < 5; i++){
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return text;

}


function beginStream() {

  var token = localStorage.getItem('clicky-token');

  $.ajax({
    type: 'GET',
    url: 'https://slack.com/api/rtm.start',
    data: {
      token: token
    },
    success: function(data) {
      if (data.ok === true) {
        connectToStream(data.url);
      }
    }
  });

}


function connectToStream(url) {

  socket = new WebSocket(url);

  socket.onopen = function(event) {

    console.log('Connected to stream');
    sendMessage('testing', 'D02HJV07K');

  };

  socket.onmessage = function(event) {

    var message = JSON.parse(event.data);
    console.log(message);
    if (message.type == 'pong') {

      // Checks to see if unresolved pings exist
      // And if pong is in response to one of them
      if (activePings.length > 0 && activePings.indexOf(message.reply_to) > -1) {

        // If pong is in response to an active ping, all active pings are cleared
        activePings = [];
        console.log('Pong!', message.reply_to);

      }

    } else if (message.type == 'message') {

      // If the first 7 characters of a string match '#Clicky'
      // The message is assumed to contain a #Clicky, and could display a notification
      if (message.text && message.text.substring(0, 9) == '_#Clicky_') {
        console.log('Incoming #Clicky!');

        var text = message.text;
        var link = text.substring(text.lastIndexOf("<") + 1, text.lastIndexOf(">"));

        createNotification(link, message.channel);

      }

    }

  };

  socket.onerror = function(error) {

    console.log('Stream error: ', error);
    sendPing();
    
  };

  socket.onclose = function() {

    console.log('Stream closed');

  };

}


function sendMessage(message, channel) {

  var id = generateId();

  var data = {
    id: id,
    type: 'message',
    channel: channel,
    text: message
  };

  socket.send(JSON.stringify(data));

}


function sendPing() {

  var id = generateId();
  var data = {
    id: id,
    type: 'ping'
  };

  activePings.push(id);

  console.log('Ping! ', id);

  // Send ping
  socket.send(JSON.stringify(data));

  // Wait 10 seconds
  setTimeout(function() {

    if (activePings.length > 0 && activePings.length < 3) {

      // If either 1 or 2 pings are still active, send another ping
      sendPing(socket);

    } else if (activePings.length >= 3) {

      // If 3 pings are active stream is assume dead and is closed
      socket.close();
      //beginStream();

    }

    // If number of active pings is 0, that indicates a pong has been recieved
    // In this case no further action is required

  }, 10000);

}


function generateId() {
  return Math.floor(Math.random() * 9000000) + 1000000;
}


function getChannelName(id) {
  return localStorage.getItem('clicky-roomIds').id;
}


function createNotification(link, user) {

  var title = '#Clicky from ' + getChannelName(user);

  var options = {
    type: 'basic',
    iconUrl: 'assets/icon128.png',
    title: '#Clicky from joshfarrant',
    message: '',
    contextMessage: link,
    isClickable: true,
    buttons: [
      {title: 'Open link'}
    ]
  };

  chrome.notifications.create(notificationId='', options=options, function(id) {
    localStorage.setItem(id, JSON.stringify(link));
  });
}

chrome.notifications.onButtonClicked.addListener(function(id) {
  if ( localStorage.getItem(id) ) {
    var json = localStorage.getItem(id);
    var link = JSON.parse(json);
    localStorage.removeItem(id);
    chrome.tabs.create({'url': link});
  }
});


chrome.notifications.onClosed.addListener(function(id) {
  localStorage.removeItem(id);
  console.info('Notification closed: ' + id);
});


beginStream();
createNotification('http://josh.farrant.me/redesign', 'D02HJV07K');


chrome.extension.onRequest.addListener(function(request,sender,sendResponse) {
  if (request.msg != 'beginOAuth') {
    return false;
  }

  $.ajax({
    type: 'GET',
    url: '/config.json',
    success: function(json) {

      var data = JSON.parse(json);
      var b = {_keyStr:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",e:function(e){var t="";var n,r,i,s,o,u,a;var f=0;e=b._utf8_encode(e);while(f<e.length){n=e.charCodeAt(f++);r=e.charCodeAt(f++);i=e.charCodeAt(f++);s=n>>2;o=(n&3)<<4|r>>4;u=(r&15)<<2|i>>6;a=i&63;if(isNaN(r)){u=a=64;}else if(isNaN(i)){a=64;}t=t+this._keyStr.charAt(s)+this._keyStr.charAt(o)+this._keyStr.charAt(u)+this._keyStr.charAt(a);}return t;},d:function(e){var t="";var n,r,i;var s,o,u,a;var f=0;e=e.replace(/[^A-Za-z0-9\+\/\=]/g,"");while(f<e.length){s=this._keyStr.indexOf(e.charAt(f++));o=this._keyStr.indexOf(e.charAt(f++));u=this._keyStr.indexOf(e.charAt(f++));a=this._keyStr.indexOf(e.charAt(f++));n=s<<2|o>>4;r=(o&15)<<4|u>>2;i=(u&3)<<6|a;t=t+String.fromCharCode(n);if(u!=64){t=t+String.fromCharCode(r);}if(a!=64){t=t+String.fromCharCode(i);}}t=b._utf8_decode(t);return t;},_utf8_encode:function(e){e=e.replace(/\r\n/g,"\n");var t="";for(var n=0;n<e.length;n++){var r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r);}else if(r>127&&r<2048){t+=String.fromCharCode(r>>6|192);t+=String.fromCharCode(r&63|128);}else{t+=String.fromCharCode(r>>12|224);t+=String.fromCharCode(r>>6&63|128);t+=String.fromCharCode(r&63|128);}}return t;},_utf8_decode:function(e){var t="";var n=0;var r=c1=c2=0;while(n<e.length){r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r);n++;}else if(r>191&&r<224){c2=e.charCodeAt(n+1);t+=String.fromCharCode((r&31)<<6|c2&63);n+=2;}else{c2=e.charCodeAt(n+1);c3=e.charCodeAt(n+2);t+=String.fromCharCode((r&15)<<12|(c2&63)<<6|c3&63);n+=3;}}return t;}};
      var j = b.d(data.c);
      var d = JSON.parse(j);

      var state = generateState();
      var url = 'https://slack.com/oauth/authorize';
      url += '?client_id=' + d.client_id;
      url += '&state=' + state;
      url += '&scope=identify,read,post,client';

      var options = {
        'interactive': true,
        'url': url
      };

      chrome.identity.launchWebAuthFlow(options, function(redirectUrl) {
        var params = getParams(redirectUrl);
        if (params.state == state) {
          d.code = params.code;
          exchangeSlackCode(d);
        }
      });

    }
  });

});