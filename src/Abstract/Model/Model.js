var _ = require('underscore'),
    mongoose = require('mongoose');
require('mongoose-schema-extend');

var Schema = mongoose.Schema;

// Errors //
const ERRORS = {
    need_name_schema: '[Error] The Model need name and schema before compile it',
    no_schema: '[Error] The schema is not defined'
};

var Model = function (attrs, value) {
    var attributes = {};
    var schemaModel = {};

    /**
     * Get model attribute
     *
     * @param {string} key
     * @returns {*}
     */
    this.get = function (key) {
        return attributes[key];
    };

    /**
     * Set model attribute
     *
     * @param {string|object} attr
     * @param value
     * @returns {Model}
     */
    this.set = function (attr, value) {
        if (_.isObject(attr)) {
            _.extend(attributes, attr);
            _.extend(schemaModel, attr);
        } else {
            if (_.isUndefined(value)) {
                return this;
            }
            attributes[attr] = value;
            schemaModel[attr] = value;
        }
        return this;
    };

    /**
     * Check if this model has an attribute
     *
     * @param {string|array} key
     * @returns {boolean}
     */
    this.has = function (key) {
        if (_.isArray(key)) {
            return !_.difference(key, _.keys(attributes)).length;
        }
        return !!attributes[key];
    };

    /**
     * Delete a model attribute
     *
     * @param {string|array} key
     */
    this.unset = function (key) {
        if (!_.isArray(key)) {
            key = [key];
        }
        _.each(key, function (k) {
            delete attributes[k];
        })
    };

    /**
     * Signal that we desire an increment of this documents version.
     *
     * @see http://mongoosejs.com/docs/api.html#model_Model-increment
     */
    this.increment = function () {
        if (!schemaModel) {
            throw new Error(ERRORS.no_schema);
        }
        return schemaModel.increment();
    };

    /**
     * Saves this document.
     *
     * @param {Function} cb
     * @returns {Model}
     * @see http://mongoosejs.com/docs/api.html#model_Model-save
     */
    this.save = function (cb) {
        if (!schemaModel) {
            throw new Error(ERRORS.no_schema);
        }
        schemaModel.save(cb);
        attributes._id = schemaModel._id;
        attributes.__v = schemaModel.__v;
        return this;
    };

    /**
     * Removes this document from the db.
     *
     * @param {Function} cb
     * @returns {Model}
     * @see http://mongoosejs.com/docs/api.html#model_Model-remove
     */
    this.remove = function (cb) {
        if (!schemaModel) {
            throw new Error(ERRORS.no_schema);
        }
        schemaModel.remove(cb);
        return this;
    };

    // if schema is defined, create schema model
    if (this._class.hasSchema()) {
        // If it is the first instance, compile the schema
        if (!this._class._isCompiled()) {
            this._class._compile();
        }

        schemaModel = new this._class.getMongooseModel()();
    }

    // set the constructor params
    this.set(attrs, value);

    // Call the initialize method of each instance
    if (this.initialize && _.isFunction(this.initialize)) {
        this.initialize.apply(this, arguments);
    }
};

/**
 * Based on Backbone.js 1.1.0 extend helper
 *
 * (c) 2010-2011 Jeremy Ashkenas, DocumentCloud Inc.
 * (c) 2011-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Backbone may be freely distributed under the MIT license.
 */
Model.extend = function(protoProps, staticProps) {
    var parent = this;
    var child;

    // The constructor function for the new subclass is either defined by you
    // (the "constructor" property in your `extend` definition), or defaulted
    // by us to simply call the parent's constructor.
    if (protoProps && _.has(protoProps, 'constructor')) {
        child = protoProps.constructor;
    } else {
        child = function() {
            var _class = this._class ? this._class : child;
            return parent.apply(_.extend(this, { _class: _class }), arguments);
        };
    }

    // Add static properties to the constructor function, if supplied.
    _.extend(child, parent, staticProps);

    // Set the prototype chain to inherit from `parent`, without calling
    // `parent`'s constructor function.
    var Surrogate = function(){ this.constructor = child; };
    Surrogate.prototype = parent.prototype;
    child.prototype = new Surrogate;

    // Add prototype properties (instance properties) to the subclass,
    // if supplied.
    if (protoProps) _.extend(child.prototype, protoProps);

    // Set a convenience property in case the parent's prototype is needed
    // later.
    child.__super__ = parent.prototype;

    // Add default statics methods
    addStatics(child);

    return child;
};

/**
 * Add statics methods
 *
 * @param self
 */
var addStatics = function (self) {
    _.extend(self, {
        getName: function () {
            return self.prototype.name;
        },
        hasSchema: function () {
            return !!self.prototype.schema;
        }
    });

    // if schema is defined, add support
    if (self.prototype.schema) {
        addMongooseSupport(self);
    }
};

/**
 * Add mongoose support to the model, with statics methods
 *
 * @param self
 */
var addMongooseSupport = function (self) {
    var schema = self.prototype.schema;
    var model;

    var options = _.extend({
        discriminatorKey: '_type',
        collection: self.prototype.name,
        strict: false
    }, self.prototype.schemaOptions);

    // Check for super schema
    if (!_.isEmpty(self.__super__) && self.__super__.schema) {
        options.collection = self.__super__.constructor.getCollectionName();
        schema = self.__super__.constructor.getSchema().extend(schema);
    } else {
        schema = new Schema(schema, options);
    }

    /**
     * Ensure that mongoose query not return parents documents
     *
     * @param conditions
     */
    var ensureCollection = function (conditions) {
        if(!_.isEmpty(self.__super__) && self.__super__.constructor.hasSchema()) {
            if (!conditions[self.__super__.constructor._getDiscriminatorKey()]) {
                conditions[self.__super__.constructor._getDiscriminatorKey()] = self.getName();
            }
        }
        return conditions;
    };

    var getCallbackDocument = function (callback) {
        return function () {
            if (arguments[1]) {
                arguments[1] = new self(arguments[1]);
            }
            callback.apply(null, arguments);
        };
    };

    var getCallbackArrayDocs = function (callback) {
        return function () {
            if (arguments[1]) {
                var models = [];
                arguments[1].forEach(function (doc) {
                    if (doc) {
                        models.push(new self(doc));
                    }
                });
                arguments[1] = models
            }

            callback.apply(null, arguments);
        };
    };

    self.getSchema = function () {
        return schema;
    };

    self.getCollectionName = function () {
        return options.collection;
    };

    self.getMongooseModel = function () {
        return model;
    };

    self._getDiscriminatorKey = function () {
        return options.discriminatorKey;
    };

    self._compile = function () {
        if (!options.collection || !schema) {
            throw new Error(ERRORS.need_name_schema);
        }
        model = mongoose.model(self.getName(), schema);
    };

    self._isCompiled = function () {
        return !!model;
    };

    /**
     * @deprecated use find(callback) instead
     */
    self.getAll = function (callback) {
        return self.find(callback);
    };

    /**
     * Finds documents
     *
     * @see http://mongoosejs.com/docs/api.html#model_Model.find
     */
    self.find = function (conditions, fields, options, callback) {
        if (_.isFunction(conditions)) {
            fields = conditions;
            conditions = {};
        }
        if (_.isFunction(callback)) {
            callback = getCallbackArrayDocs(callback);
        } else if (_.isFunction(options)) {
            options = getCallbackArrayDocs(options);
        } else if (_.isFunction(fields)) {
            fields = getCallbackArrayDocs(fields);
        }
        model.find(ensureCollection(conditions), fields, options, callback);
    };

    /**
     * Finds a single document by id
     *
     * @see http://mongoosejs.com/docs/api.html#model_Model.findById
     */
    self.findById = function (id, fields, options, callback) {
        self.findOne({ _id: id }, fields, options, callback);
    };

    /**
     * Finds one document
     *
     * @see http://mongoosejs.com/docs/api.html#model_Model.findOne
     */
    self.findOne = function (conditions, fields, options, callback) {
        if (_.isFunction(conditions)) {
            fields = conditions;
            conditions = {};
        }
        if (_.isFunction(options)) {
            options = getCallbackDocument(options);
        } else if (_.isFunction(fields)) {
            fields = getCallbackDocument(fields);
        }
        model.findOne(ensureCollection(conditions), fields, options, callback);
    };

    /**
     * Counts number of matching documents in a database collection.
     *
     * @see http://mongoosejs.com/docs/api.html#model_Model.count
     */
    self.count = function (conditions, callback) {
        if (_.isFunction(conditions)) {
            callback = conditions;
            conditions = {};
        }
        return model.count(ensureCollection(conditions), callback);
    };

    /**
     * Creates a Query for a distinct operation.
     *
     * @see http://mongoosejs.com/docs/api.html#model_Model.distinct
     */
    self.distinct = function (field, conditions, callback) {
        if (_.isFunction(conditions)) {
            callback = conditions;
            conditions = {};
        }
        return model.distinct(field, ensureCollection(conditions), callback);
    };

    /**
     * Issues a mongodb findAndModify update command.
     *
     * @see http://mongoosejs.com/docs/api.html#model_Model.findOneAndUpdate
     */
    self.findOneAndUpdate = function (conditions, update, options, callback) {
        if (_.isFunction(callback)) {
            callback = getCallbackDocument(callback);
        } else if (_.isFunction(options)) {
            options = getCallbackDocument(options);
        } else if (_.isFunction(update)) {
            options = getCallbackDocument(update);
            update = conditions;
            conditions = {};
        }
        // if there is only one argument, is update
        if (arguments.length === 1) {
            update = conditions;
            conditions = {};
        }
        model.findOneAndUpdate(ensureCollection(conditions), update, options, callback);
    };

    /**
     * Issues a mongodb findAndModify update command
     *
     * @see http://mongoosejs.com/docs/api.html#model_Model.findOneAndUpdate
     */
    self.findByIdAndUpdate = function (id, update, options, callback) {
        if (arguments.length === 1) {
            model.findByIdAndUpdate(id);
            return;
        }
        self.findOneAndUpdate({ _id: id }, update, options, callback);
    };

    /**
     * Issue a mongodb findAndModify remove command
     *
     * @see http://mongoosejs.com/docs/api.html#model_Model.findByIdAndRemove
     */
    self.findOneAndRemove = function (conditions, options, callback) {
        if (arguments.length === 1 && _.isFunction(conditions)) {
            model.findOneAndRemove(conditions);
            return;
        }
        if (_.isFunction(callback)) {
            callback = getCallbackDocument(callback);
        } else if (_.isFunction(options)) {
            options = getCallbackDocument(options);
        }
        model.findOneAndRemove(ensureCollection(conditions), options, callback);
    };

    /**
     * Issue a mongodb findAndModify remove command by a documents id
     *
     * @see http://mongoosejs.com/docs/api.html#model_Model.findByIdAndRemove
     */
    self.findByIdAndRemove = function (id, options, callback) {
        if (arguments.length === 1 && _.isFunction(id)) {
            model.findOneAndRemove(id);
            return;
        }
        self.findOneAndRemove({ _id: id }, options, callback);
    };

    /**
     * Shortcut for creating a new Document that is automatically saved to the db if valid
     *
     * @see http://mongoosejs.com/docs/api.html#model_Model.create
     */
    self.create = function (doc, callback) {
        model.create(doc, getCallbackDocument(callback));
    };

    /**
     * Updates documents in the database without returning them
     *
     * @see http://mongoosejs.com/docs/api.html#model_Model.update
     */
    self.update = function (conditions, doc, options, callback) {
        ensureCollection(conditions);
        if (_.isFunction(options)) {
            callback = options;
            options = {};
        }
        model.update(conditions, doc, options, getCallbackDocument(callback));
    };

    /**
     * Executes a mapReduce command
     *
     * @see http://mongoosejs.com/docs/api.html#model_Model.mapReduce
     */
    self.mapReduce = function (o, callback) {
        model.mapReduce(o, getCallbackArrayDocs(callback));
    };

    /**
     * geoNear support for Mongoose
     *
     * @see http://mongoosejs.com/docs/api.html#model_Model.geoNear
     */
    self.geoNear = function (near, options, callback) {
        if (arguments.length === 1) {
            model.geoNear(near);
            return;
        }
        if (_.isFunction(near)) {
            near = getCallbackArrayDocs(near);
        } else if (_.isFunction(options)) {
            options = getCallbackArrayDocs(options);
        } else if (_.isFunction(callback)) {
            callback = getCallbackArrayDocs(callback);
        }
        model.geoNear(near, options, callback);
    };

    /**
     * Performs aggregations on the models collection
     *
     * @see http://mongoosejs.com/docs/api.html#model_Model.aggregate
     */
    self.aggregate = function () {
        model.aggregate.apply(null, arguments);
    };

    /**
     * Implements $geoSearch functionality for Mongoose
     *
     * @see http://mongoosejs.com/docs/api.html#model_Model.geoSearch
     */
    self.geoSearch = function (conditions, options, callback) {
        if (_.isFunction(conditions)) {
            options = conditions;
            conditions = {};
        }
        if (_.isFunction(options)) {
            options = getCallbackArrayDocs(options);
        } else if (_.isFunction(callback)) {
            callback = getCallbackArrayDocs(callback);
        }
        model.geoSearch(ensureCollection(conditions), options, callback);
    };

    /**
     * Populates document references
     *
     * @see http://mongoosejs.com/docs/api.html#model_Model.populate
     */
    self.populate = function (docs, options, callback) {
        if (_.isFunction(options)) {
            v = getCallbackArrayDocs(options);
            options = {};
        } else if (_.isFunction(cb)) {
            callback = getCallbackArrayDocs(callback);
        }
        model.populate(docs, ensureCollection(options), callback);
    };

    return schema;
};

module.exports = Model;