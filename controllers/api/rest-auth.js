/**
 * Created by KIMSEONHO on 2017-01-10.
 */
"use strict";

const crypto = require('crypto'),
   models = require('../../models'),
   users = models.users,
   moment = require("moment"),
   _ = require('lodash'),
   mailgun = require('../../config/mailgun'),
   mailchimp = require('../../config/mailchimp'),
   config = require('../../config/main'),
   genToken = require("../../utils/genToken");


/**
 * passport의 LocalStrategy(ID, Password)를 이용함
 * @param req
 * @param res
 * @param next
 * @returns {*}
 */

//------------------------------------------
//  로그인
//------------------------------------------
exports.login = function(req, res, next) {

   let userInfo = genToken.setUserInfo(req.user);   // passport에서 받은 object

   res.append('Authorization', 'Bearer ' + genToken.generateUserToken(userInfo));
   res.cookie('Authorization', 'Bearer ' + genToken.generateUserToken(userInfo));

   return res.status(201).json({
      id_token: 'Bearer ' + genToken.generateUserToken(userInfo),
      user: userInfo,    // password가 hash로 오기 때문에,
      statusCode: 1
   });
}

//------------------------------------------
// 회원가입
//------------------------------------------
exports.register = function(req, res, next) {

   // Check for registration errors
   const email = req.body.email;
   const password = req.body.password;
   const member_type = req.body.member_type;
   //사업자는 전화번호 필수로
   const telephone = req.body.telephone;

   // Return error if no email provided
   if (!email) {
      return res.status(400).send({
         errorMsg: 'You must enter an email address.',
         statusCode: -1
      });
   }

   // Return error if no password provided
   if (!password) {
      return res.status(400).send({errorMsg: 'You must enter a password.', statusCode: -1});
   }

   // Return error if no member_type provided
   if (!member_type) {
      return res.status(400).send({
         errorMsg: 'You must enter an member_type.',
         statusCode: -1
      });
   }

   // Return error if no telephone provided
   if (member_type ==='BUSINESS' && !telephone) {
      return res.status(400).send({errorMsg: 'You must enter a telephone.', statusCode: -1});
   }

   return users.findOne({
      where: {
         email: email
      }
   }).then(function (existingUser) {
      if (existingUser) {  // If user is not unique, return error
         return res.status(400).send({
            errorMsg: 'That email address is already in use.',
            statusCode: 2
         });
      } else {     // If email is unique and password was provided, create account
         let user = {
            email: email,
            password: password,
            member_type: member_type,
            telephone: telephone
         };

         // 회원 가입시
         users.create(user).then(function (newUser) {
            // Respond with JWT if user was created
            let userInfo = genToken.setUserInfo(newUser);
            let token = 'Bearer ' + genToken.generateUserToken(userInfo);
            res.append('Authorization', token);

            return res.status(201).json({
               id_token: token,
               user: userInfo,
               status: 1
            });
         }).catch(function (err) {    // end Member.create
            if (err) {
               res.status(422).json({errorMsg: 'Internal Error', statusCode: 9});
            }
         });
      }
   }).catch(function (err) {    // end Member.findOne
      if (err) {
         return next(err);
      }
   });
}

//------------------------------------------
//  탈퇴
//------------------------------------------
exports.quit = function (req, res, next) {

   //탈퇴버튼 누를시 req_drop_data에 현재 시간과 user_status에 0을 넣음
   const email = req.body.email;
   const day = new Date();
   let token = req.headers['authorization'];

   if(!token){
      return res.status(400).json({
         errorMsg: 'Do not have a token',
         statusCode: -1
      });
   }

   if (!email) {
      return res.status(400).send({
         errorMsg: 'You must enter an email address.',
         statusCode: -2
      });
   }
   //이메일과 user상태가 1(활성화된 사람)을 찾아서 update문을 날림.
   return users.findOne({
      where: {
         email: email,
         user_status: 1
      }
   }).then(function (existingUser) {
      if (existingUser) {  // If user is not unique, return error
         models.sequelize.query("update users set user_status = 0, updated_date = ?  where email = ?", {
               replacements: [day, email]
         }).then(function (result) {
            return res.status(200).json({
               msg: 'Clear update user quit',
               statusCode: 1
            });
         }).catch(function(err) {
            if (err) {
               return res.status(401).json({
                  errorMsg: 'DB error.',
                  statusCode: 9
               });
            }
         });
      } else {     // If email is unique and password was provided, create account
         return res.status(401).json({
            errorMsg: 'do not have user in DB.',
            statusCode: -2
         });
      }
   }).catch(function (err) {
      if (err) {
         return res.status(401).json({
            errorMsg: 'DB error.',
            statusCode: 9
         });
      }
   });
}

//------------------------------------------
//이메일을 받으면 정보와 메타데이터를 전송 하는 api
//------------------------------------------
exports.info = function(req, res, next) {
   const email = req.body.email;
   //여기서는 client -> server 토근 나려줌
   //server- >client로는 토큰 X

   // Return error if no email provided
   if (!email) {
      return res.status(400).json({
         errorMsg: 'You must enter an email address.',
         statusCode: -1
      });
   }

   models.sequelize.query("select a.ID, a.email, a.password, a.member_type, a.telephone, " +
      "a.registered_date, a.display_name, a.activation_key, a.locale, a.profile_image_path, " +
      "a.updated_date, a.user_status, b.meta_key, b.meta_value " +
      "from users as a, user_metas as b where a.email = (?) and a.ID = b.user_id",
      { replacements: [email],type: models.sequelize.QueryTypes.SELECT})
      .then(function (data) {
         if(data.length <= 0){   // not exist user
            return res.status(401).json({
               errorMsg: 'Email do not exist DB',
               statusCode: 2
            });
         }else{                  // exist user
            return res.status(201).json({
               user_info: data,
               status: 1
            });
         }
      }).catch(function (err) {    // end select
      if (err) {
         return res.status(401).json({
            errorMsg: 'DB error.',
            statusCode: 9
         });
      }
   });
}

//------------------------------------------
//  회원정보 수정
//------------------------------------------
exports.modifyInfo = function(req, res, next) {
   //회원정보 수정 되면 server -> client 토큰 필요
   // 비밀번호 바뀌면 새로운 패스워드(new_password)로  토큰 만듬
   // 비밀번호 안바뀌면 이전에 있던걸(password)로 토큰 만듬
   const email = req.body.email;
   const password = req.body.password;             //이전의 패스워드
   const new_password = req.body.new_password;        //새로운 패스워드
   let telephone = req.body.telephone;
   let display_name = req.body.display_name;
   let profile_image_path = req.body.profile_image_path;
   let user_info = {};

   let token = req.headers['authorization'];

   if (!token) {
      return res.status(400).json({
         errorMsg: 'Do not have a token',
         statusCode: -1
      })
   }

   if (!email) {
      return res.status(400).json({
         errorMsg: 'You must enter an email address.',
         statusCode: -1
      });
   }
   //없을때 null로 초기화
   if (telephone === undefined) {
      telephone = null;
   }
   if (display_name === undefined) {
      display_name = null;
   }
   if (profile_image_path === undefined) {
      profile_image_path = null;
   }
   //새로운 패스워드가 없으면 비밀번호는 변경하지 않는다.
   if (new_password === undefined || new_password === null || new_password.length <= 0) {
      user_info = {
         telephone: telephone,
         display_name: display_name,
         profile_image_path: profile_image_path
      }
   } else {    //비밀번호도 같이 변경
      user_info = {
         password: new_password,
         telephone: telephone,
         display_name: display_name,
         profile_image_path: profile_image_path
      }
   }
   //활성화가 되어있는 유저를 찾음
   return users.findOne({
      where: {
         email: email,
         user_status: 1
      }
   }).then(function (existingUser) {
      //찾은경우에는 업데이트 실행
      if(existingUser) {
         return users.update(
            user_info,
            {where: {email: email, user_status: 1}}
         ).then(function (result) {
            // passport에서 받은 object
            return users.findOne({
               where: {
                  email: email,
                  user_status: 1
               }
            }).then(function (data){
               let userInfo = genToken.setUserInfo(data);   // passport에서 받은 object

               return res.status(200).json({
                  id_token: 'Bearer ' + genToken.generateUserToken(userInfo),
                  msg: 'update success',
                  statusCode: 1
               });
            }).catch(function (err) {
               if (err) {
                  return res.status(401).json({
                     errorMsg: 'DB select error',
                     statusCode: -2
                  });
               }
            })
         }).catch(function (err) {
            if (err) {
               return res.status(401).json({
                  errorMsg: 'DB update error',
                  statusCode: -3
               })
            }
         })
      }else {
         //아닌경우 유저가 없을경우
         return res.status(402).json({
            errorMsg: 'do not user in DB or quit user',
            statusCode: -4
         });
      }
   }).catch(function (err) {
      if (err) {
         return res.status(401).json({
            errorMsg: 'DB first select error',
            statusCode: -2
         })
      }
   });
}


//========================================
// Forgot Password Route
//========================================
exports.forgotPassword = function (req, res, next) {
   const email = req.body.email;

   return users.findOne({where: {email: email}}).then(function (existingUser) {
      // If user is not found, return error
      if (existingUser == null) {
         res.status(422).json({errorMsg: 'Your request could not be processed as entered. Please try again.'});
         return next(new Error("not matching, please check again."));
      }

      // If user is found, generate and save resetToken

      // Generate a token with Crypto
      crypto.randomBytes(48, function (err, buffer) {
         const resetToken = buffer.toString('hex');
         if (err) {
            return next(err);
         }

         existingUser.resetPasswordToken = resetToken;
         existingUser.resetPasswordExpires = Date.now() + 3600000; // 1 hour

         existingUser.save().then(function (user) {

            const message = {
               subject: 'Reset Password',
               text: 'You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n' +
               'Please click on the following link, or paste this into your browser to complete the process:\n\n' +
               'http://' + req.headers.host + '/reset-password/' + resetToken + '\n\n' +
               'If you did not request this, please ignore this email and your password will remain unchanged.\n'
            }

            // Otherwise, send user email via Mailgun
            mailgun.sendEmail(existingUser.email, message);

            res.status(200).json({message: 'Please check your email for the link to reset your password.'});
            next();
         }).catch(function (err) {
            // If error in saving token, return it
            if (err) {
               return next(err);
            }
         });
      });
   }).catch(function (err) {    //end Member.findOne
      // If user is not found, return error
      if (err) {
         res.status(422).json({errorMsg: 'Your request could not be processed as entered. Please try again.'});
         return next(err);
      }
   });
}
