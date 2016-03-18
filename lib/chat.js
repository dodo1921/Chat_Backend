var pub = require('redis-connection')();
var sub = require('redis-connection')('subscriber');

var gcm  = require('node-gcm');
var signature = require('cookie-signature');
var cookie = require('cookie');
var sender = new gcm.Sender(process.env.GCM_KEY);

var SocketIO = require('socket.io');
var io;


function init (listener, callback) {
  
    
    sub.on("ready", function () {      
      
          io = SocketIO.listen(listener);
          io.use(function(socket, next){            

            var cookie = socket.request.headers.cookie;

            var part = cookie.split(';');
            var morepart = part[0].split('=');

            var finalcookie = decodeURIComponent(morepart[1]);

            console.log('Decoded::'+finalcookie);

            var result = signature.unsign(finalcookie.slice(2), 'secretToBeChanged');

            if(result === false)
                next(new Error('Auth Error'));

            console.log('UnSigned::'+result);

            var x = result.slice(2);

            var obj = JSON.parse(x);

            console.log('>>>>>'+obj.passport.user);

            var y = obj.passport.user.split(':::');

            //socket.join(y[2]);

            socket.request.headers.channel = y[2];            

            next();

          });

          io.on('connection', function(socket){

                var channel = socket.request.headers.channel;

                socket.join(channel);
                sub.subscribe(channel);

                socket.emit('join');                  

                socket.on('publish', function(packet, callback){

                  /*
    
                    packet = {
                        channel: *******, //receiver's channel
                        gcm_token: *********,
                        senderId: *******,
                        receiverId: ******,
                        data: packetString
                    }


                  */


                    var currentTime = new Date().getTime(); 

                    var packetString = currentTime+':::::'+packet.data;

                    pub.publish(packet.channel, packetString, function(err, response){

                          if(err) callback({ 'err': true, 'packet': packet});

                          var arg = [packet.channel, currentTime, packetString];

                          process.nextTick(function(arg){

                               pub.zadd(arg, function(err, response){

                                  if(err) console.log('ZADD ERROR:'+ err);

                                  console.log('ZADD RESPONSE:'+ response);

                               });

                          });

                          if(response === 0){

                                var token = packet.gcm_token;

                                process.nextTick(function( packetString, token ){

                                    var message = new gcm.Message();
                                    var regTokens = [token];
                                    message.addData('packet', packetString);

                                    sender.send(message, { registrationTokens: regTokens }, 5, function (err, response) {
                                      
                                      if(err) console.error('GCM ERROR:'+ err);

                                      else    console.log('GCM RESPONSE:'+ response);

                                    });

                                });

                          }

                          callback({ err: false, packet: packet});

                    });                

                   

                });

                socket.on('history', function(range, callback){

                  // redis get Zrangescore for range.start to range.stop
                  //socket.emit the result

                    pub.zrangescore(channel, range.start range.end, function(err, repyList){

                      if(err) callback({ 'err': true });

                      callback({ err: false, 'replyList': replyList });

                    });

                });


                socket.on('presence', function( presence, callback){

                    pub.publish(presence.channel, presence.presenceString , function(err, response){

                        if(err) callback({ 'err': true, 'presence': presence });

                        callback({ err: false, 'presence': presence, 'response': response });

                    });                  

                });


                socket.on('typing', function( typing, callback){

                    pub.publish( typing.channel, typing.typingString , function(err, response){

                        if(err) callback({ err: true, 'typing': typing });

                        callback({ err: false, 'presence': presence, 'response': response });

                    });                  

                });


                socket.on('disconnect', function(socket){

                      //leave channel and unsubscribe from channel
                      sub.unsubscribe(channel)
                      console.log('Disconnected');   

                });

          });

          
          
          sub.on('message', function (channel, message) {
    	               console.log(channel + " : " + message);
    	               //io.emit(channel, message); // relay to all connected socket.io clients
                     io.to(channel).emit( channel, message);
          });



          setTimeout(function(){ callback() }, 300); // wait for socket to boot

    });

};








module.exports = {
  init: init,  
  pub: pub,
  sub: sub
};
