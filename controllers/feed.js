const { v4: uuidv4 } = require('uuid');
const { validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');

const io = require('../socket');
const Post = require('../models/post');
const User = require('../models/user');

exports.getPosts = async (req, res, next) => {
	//Extract page number from client
	const currentPage = req.query.page || 1;
	//Define the pagination limit
	const perPage = 2;

	//Get all the posts as per pagination rules
	try {
		const totalItems = await Post.find().countDocuments();
		const posts = await Post.find()
			.populate('creator')
			.sort({ createdAt: -1 })
			.skip((currentPage - 1) * perPage)
			.limit(perPage);

		res.status(200).json({
			message: 'Fetched posts successfully.',
			posts: posts,
			totalItems: totalItems,
		});
	} catch (err) {
		if (!err.statusCode) {
			err.statusCode = 500;
		}
		next(err);
	}
};

exports.createPost = async (req, res, next) => {
	//Get any validation errors defined in the routes
	const err = validationResult(req);
	//Check if we got any validation errors
	if (!err.isEmpty()) {
		const error = new Error('Validation failed, entered data is incorrect.');
		error.statusCode = 422;
		throw error;
	}
	//Check if image was uploaded through multer and appended to our request object
	if (!req.file) {
		const error = new Error('No image provided.');
		error.statusCode = 422;
		throw error;
	}

	//If no errors, we execute below lines to create a post
	const title = req.body.title;
	const imageUrl = req.file.path;
	const content = req.body.content;
	let creator;

	//Create a Post mongoose model
	const post = new Post({
		title: title,
		imageUrl: imageUrl,
		content: content,
		creator: req.userId,
	});

	//Async operations to save post and update it with the user's post property in MongoDB
	try {
		//Save post mongoose model
		await post.save();
		//Find user who created this post
		const user = await User.findById(req.userId);
		creator = user;
		//Update the posts of that user in db
		user.posts.push(post);
		//Save the user's updated state in the db
		await user.save();
		//Inform all the other client's connected to this server about the new created post and send the data
		//which holds the keys action and post itself
		io.getIO().emit('posts', {
			action: 'create',
			post: { ...post._doc, creator: { _id: req.userId, name: user.name } },
		});
		//Return REST API json response data providing the client info about WHO created the post
		res.status(201).json({
			message: 'Post has been successfully saved.',
			post: post,
			creator: { _id: creator._id, name: creator.name },
		});
	} catch (err) {
		if (!err.statusCode) {
			err.statusCode = 500;
		}
		next(err);
	}
};

exports.getPost = async (req, res, next) => {
	//Extract postId through client params(:)
	const postId = req.params.postId;

	try {
		//Check if post exists and return if found, else return error
		const post = await Post.findById(postid);
		if (!post) {
			const error = new Error('Could Not find any post.');
			error.statusCode = 404;
			throw error;
		}
		res.status(200).json({ message: 'Post fetched.' });
	} catch (err) {
		if (!err.statusCode) {
			err.statusCode = 500;
		}
		next(err);
	}
};

exports.updatePost = async (req, res, next) => {
	//Get any validation errors defined in the routes
	const err = validationResult(req);
	//Check if we got any validation errors
	if (!err.isEmpty()) {
		const error = new Error('Validation failed, entered data is incorrect.');
		error.statusCode = 422;
		throw error;
	}
	//If no errors, below lines execute
	const postId = req.params.postId;
	const title = req.body.title;
	const content = req.body.content;
	//imageUrl if sent as a string in the request body
	let imageUrl = req.body.imageUrl;
	//imageUrl if sent through file object attached to request
	if (req.file) {
		imageUrl = req.file.path;
	}
	//Throw error if no imageURL was found
	if (!imageUrl) {
		const error = new Error('No file picked.');
		error.statusCode = 422;
		throw error;
	}
	//Async operations to update post
	try {
		//Check if post exists
		const post = await (await Post.findById(postId)).populate('creator');
		//If no post throw error
		if (!post) {
			const error = new Error('Could Not find any post.');
			error.statusCode = 404;
			throw error;
		}
		//Check if loggedIN user created this post else block access to update it
		if (post.creator._id.toString() !== req.userId) {
			const error = new Error('Not authorized!');
			error.statusCode = 403;
			throw error;
		}
		//If there's a change in imageURL clear the old imageURL from memory
		if (imageUrl !== post.imageUrl) {
			clearImage(post.imageUrl);
		}
		//Populate post fields and save the Post mongoose model
		post.title = title;
		post.imageUrl = imageUrl;
		post.content = content;
		const saveResult = await post.save();
		//Updated status of posts is sent to all the connected clients
		io.getIO().emit('posts', { action: 'update', post: saveResult });
		res.status(200).json({ message: 'Post updated.', post: result });
	} catch (err) {
		if (!err.statusCode) {
			err.statusCode = 500;
		}
		next(err);
	}
};

exports.deletePost = async (req, res, next) => {
	const postId = req.params.postId;
	try {
		//Check if the post exists before deleting
		const post = await Post.findById(postId);
		if (!post) {
			const error = new Error('Could Not find any post.');
			error.statusCode = 404;
			throw error;
		}

		//Check if the loggedIn user created this post
		if (post.creator.toString() !== req.userId) {
			const error = new Error('Not authorized!');
			error.statusCode = 403;
			throw error;
		}

		//Unlink/clear the filepath of the image stored
		clearImage(post.imageUrl);

		const postRemoveResult = await Post.findByIdAndRemove(postId);
		const user = await User.findById(req.userId);
		user.posts.pull(postId);
		const userSaveResult = await user.save();
		io.getIO().emit('posts', { action: 'delete', post: postId });
		res.status(200).json({ message: 'Deleted post.' });
	} catch (err) {
		if (!err.statusCode) {
			err.statusCode = 500;
		}
		next(err);
	}
};

const clearImage = (filepath) => {
	filepath = path.join(__dirname, '..', filePath);
	fs.unlink(filePath, (err) => console.log(err));
};
