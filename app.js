const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const app = express();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
app.use(express.json());
const databasePath = path.join(__dirname, "twitterClone.db");
let database = null;

const initializeAndDbAndServer = async () => {
  try {
    database = await open({ filename: databasePath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log(`server is running on http://localhost:3000`);
    });
  } catch (error) {
    console.log(`Database error is ${error}`);
    process.exit(1);
  }
};
initializeAndDbAndServer();

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const checkUserQuery = `select username from user where username = '${username}';`;
  const checkUserQueryResponse = await database.get(checkUserQuery);
  console.log(checkUserQueryResponse);
  if (checkUserQueryResponse === undefined) {
    if (password.length >= 6) {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `insert into user(name, username, password, gender) values(
          '${name}','${username}','${hashedPassword}','${gender}');`;
      await database.run(createUserQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUserQuery = `select * from user where username = '${username}';`;
  const checkUserQueryResponse = await database.get(checkUserQuery);

  if (checkUserQueryResponse !== undefined) {
    const isPasswordMatched = await bcrypt.compare(
      password,
      checkUserQueryResponse.password
    );
    if (isPasswordMatched) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "secretkey");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }

  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, "secretkey", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username = '${username}';`;
  const getUserIdQueryResponse = await database.get(getUserIdQuery);
  //console.log(getUserIdQueryResponse);
  const userId = getUserIdQueryResponse.user_id;
  const getFollowersIdQuery = `select following_user_id from follower where follower_user_id = '${userId}';`;
  const followerIds = await database.all(getFollowersIdQuery);
  const followersIdsSimple = followerIds.map((eachItem) => {
    return eachItem.following_user_id;
  });
  const getTweetsQuery = `select user.username, tweet.tweet, tweet.date_time as dateTime from user inner join tweet on user.user_id = tweet.user_id where user.user_id in (${followersIdsSimple}) order by tweet.date_time desc limit 4; `;
  const getTweetsQueryResponse = await database.all(getTweetsQuery);
  response.send(getTweetsQueryResponse);
});

app.get("/user/following", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `select user_id from user where username = '${username}';`;
  const getUserIdQueryResponse = await database.get(getUserIdQuery);
  //console.log(getUserIdQueryResponse);
  const userId = getUserIdQueryResponse.user_id;
  const getFollowersIdQuery = `select following_user_id from follower where follower_user_id = '${userId}';`;
  const followerIds = await database.all(getFollowersIdQuery);
  const followersIdsSimple = followerIds.map((eachItem) => {
    return eachItem.following_user_id;
  });
  //response.send(followersIdsSimple);
  const getFollowingQuery = `select user.name from user where user.user_id in (${followersIdsSimple});`;
  const getFollowingQueryResponse = await database.all(getFollowingQuery);
  response.send(getFollowingQueryResponse);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);
  //console.log(getUserId);
  const getFollowerIdsQuery = `select follower_user_id from follower where following_user_id=${getUserId.user_id};`;
  const getFollowerIdsArray = await database.all(getFollowerIdsQuery);
  console.log(getFollowerIdsArray);
  const getFollowerIds = getFollowerIdsArray.map((eachUser) => {
    return eachUser.follower_user_id;
  });
  //console.log(`${getFollowerIds}`);
  //get tweet id of user following x made
  const getFollowersNameQuery = `select name from user where user_id in (${getFollowerIds});`;
  const getFollowersName = await database.all(getFollowersNameQuery);
  //console.log(getFollowersName);
  response.send(getFollowersName);
});

app.get("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getUserIdQuery = `select user_id from user where username = '${username}';`;
  const getUserIdQueryResponse = await database.get(getUserIdQuery);
  //console.log(getUserIdQueryResponse);
  const userId = getUserIdQueryResponse.user_id;
  const getFollowersIdQuery = `select following_user_id from follower where follower_user_id = '${userId}';`;
  const followerIds = await database.all(getFollowersIdQuery);
  const followersIdsSimple = followerIds.map((eachItem) => {
    return eachItem.following_user_id;
  });
  const getTweetQuery = `select tweet.tweet, count(distinct like.like_id) as likes, count(distinct reply.reply) as replies, tweet.date_time as dateTime from tweet inner join like on tweet.tweet_id = like.tweet_id inner join reply on like.tweet_id = reply.tweet_id where tweet.tweet_id = '${tweetId}'and tweet.user_id in (${followersIdsSimple}) ;`;
  const getTweetResponse = await database.get(getTweetQuery);
  if (getTweetResponse.tweet === null) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(getTweetResponse);
  }
});
const convertLikedUserNameDBObj = (dbObject) => {
  return {
    likes: dbObject,
  };
};

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    //console.log(tweetId);
    let { username } = request;
    const getUserIdQuery = `select user_id from user where username='${username}';`;
    const getUserId = await database.get(getUserIdQuery);
    //console.log(getUserId);
    //get the ids of whom thw use is following
    const getFollowingIdsQuery = `select following_user_id from follower where follower_user_id=${getUserId.user_id};`;
    const getFollowingIdsArray = await database.all(getFollowingIdsQuery);
    //console.log(getFollowingIdsArray);
    const getFollowingIds = getFollowingIdsArray.map((eachFollower) => {
      return eachFollower.following_user_id;
    });
    // console.log(getFollowingIds);
    //check is the tweet ( using tweet id) made by his followers
    const getTweetIdsQuery = `select tweet_id from tweet where user_id in (${getFollowingIds});`;
    const getTweetIdsArray = await database.all(getTweetIdsQuery);
    const getTweetIds = getTweetIdsArray.map((eachTweet) => {
      return eachTweet.tweet_id;
    });
    //console.log(getTweetIds);
    //console.log(getTweetIds.includes(parseInt(tweetId)));
    if (getTweetIds.includes(parseInt(tweetId))) {
      const getLikedUsersNameQuery = `select user.username as likes from user inner join like
       on user.user_id=like.user_id where like.tweet_id=${tweetId};`;
      const getLikedUserNamesArray = await database.all(getLikedUsersNameQuery);
      //console.log(getLikedUserNamesArray);
      const getLikedUserNames = getLikedUserNamesArray.map((eachUser) => {
        return eachUser.likes;
      });
      //console.log(getLikedUserNames);
      /*console.log(
        convertLikedUserNameDBObj(getLikedUserNames)
      );*/
      response.send(convertLikedUserNameDBObj(getLikedUserNames));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

const convertRepliesUserNameDBObj = (dbObject) => {
  return {
    replies: dbObject,
  };
};

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserIdQuery = `select user_id from user where username='${username}';`;
    const getUserId = await database.get(getUserIdQuery);
    //console.log(getUserId);
    //get the ids of whom thw use is following
    const getFollowingIdsQuery = `select following_user_id from follower where follower_user_id=${getUserId.user_id};`;
    const getFollowingIdsArray = await database.all(getFollowingIdsQuery);
    //console.log(getFollowingIdsArray);
    const getFollowingIds = getFollowingIdsArray.map((eachFollower) => {
      return eachFollower.following_user_id;
    });
    const getTweetIdsQuery = `select tweet.tweet_id from tweet where tweet.user_id in (${getFollowingIds})`;
    const getTweetIdsResponse = await database.all(getTweetIdsQuery);
    const getTweetIds = getTweetIdsResponse.map((eachItem) => {
      return eachItem.tweet_id;
    });
    if (getTweetIds.includes(parseInt(tweetId))) {
      const getRepliesQuery = `select user.name, reply.reply from reply inner join user on reply.user_id = user.user_id where reply.tweet_id = '${tweetId}';`;
      const getRepliesResponse = await database.all(getRepliesQuery);

      response.send(convertRepliesUserNameDBObj(getRepliesResponse));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//api9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const myTweets = await database.all(`
    select 
    tweet.tweet,
    count(distinct like.like_id) as likes,
    count(distinct reply.reply_id) as replies,
    tweet.date_time
    from
    tweet
    left join like on tweet.tweet_id = like.tweet_id
    left join reply on tweet.tweet_id = reply.tweet_id
    where tweet.user_id = (select user_id from user where username = "${request.username}")
    group by tweet.tweet_id;
    `);
  response.send(
    myTweets.map((item) => {
      const { date_time, ...rest } = item;
      return { ...rest, dateTime: date_time };
    })
  );
});
//api10

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);
  //console.log(getUserId.user_id);
  const { tweet } = request.body;
  //console.log(tweet);
  //const currentDate = format(new Date(), "yyyy-MM-dd HH-mm-ss");
  const currentDate = new Date();
  console.log(currentDate.toISOString().replace("T", " "));

  const postRequestQuery = `insert into tweet(tweet, user_id, date_time) values ("${tweet}", ${getUserId.user_id}, '${currentDate}');`;

  const responseResult = await database.run(postRequestQuery);
  const tweet_id = responseResult.lastID;
  response.send("Created a Tweet");
});

app.delete("/tweets/:tweetId", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);
  //console.log(getUserId);
  const { tweetId } = request.params;
  const getTweetsQuery = `select tweet.tweet_id from tweet where tweet.user_id = '${getUserId.user_id}';`;
  const getTweets = await database.all(getTweetsQuery);
  const getTweetsSimple = getTweets.map((eachItem) => {
    return eachItem.tweet_id;
  });
  console.log(getTweetsSimple);
  //console.log(getTweets);
  if (getTweetsSimple.includes(parseInt(tweetId))) {
    //console.log("yes");
    const deleteTweetQuery = `delete from tweet where tweet.tweet_id = '${tweetId}';`;
    await database.run(deleteTweetQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
