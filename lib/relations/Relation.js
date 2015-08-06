'use strict';

var _ = require('lodash')
  , utils = require('../utils')
  , QueryBuilder = require('../QueryBuilder');

/**
 * @typedef {Object} RelationJoin
 *
 * @property {String} from
 * @property {String} to
 * @property {Object} through
 * @property {String} through.from
 * @property {String} through.to
 */

/**
 * @typedef {Object} RelationMapping
 *
 * @property {Model|String} modelClass
 *    A {@link Model} subclass constructor or an absolute path to a module that exports one.
 *
 * @property {Relation} relation
 *    A relation constructor. You can use one of Model.OneToOneRelation, Model.OneToManyRelation and
 *    Model.ManyToManyRelation or even write your own relation type by subclassing {@link Relation}.
 *
 * @property {Object|function(QueryBuilder)} filter
 *    Additional filter for the relation. It can be either a hash of {column: 'value'} pairs or
 *    a function that takes a QueryBuilder as a parameter.
 *
 * @property {RelationJoin} [join]
 *    An object that describes how the two models are related.
 */

/**
 * Represents a relation between two `Model` subclasses.
 *
 * @param {String} relationName
 *    Name of the relation.
 *
 * @param {Model} OwnerClass
 *    The Model subclass that owns this relation.
 *
 * @ignore
 * @constructor
 */
function Relation(relationName, OwnerClass) {
  /**
   * Name of the relation.
   *
   * @type {String}
   */
  this.name = relationName;

  /**
   * The owner class of this relation.
   *
   * This must be a subclass of Model.
   *
   * @type {Model}
   */
  this.ownerModelClass = OwnerClass;

  /**
   * The related class.
   *
   * This must be a subclass of Model.
   *
   * @type {Model}
   */
  this.relatedModelClass = null;

  /**
   * The relation column in the owner table.
   *
   * @type {String}
   */
  this.ownerCol = null;

  /**
   * The relation property in the owner model.
   *
   * @type {String}
   */
  this.ownerProp = null;

  /**
   * The relation column in the related table.
   *
   * @type {String}
   */
  this.relatedCol = null;

  /**
   * The relation property in the related model.
   *
   * @type {String}
   */
  this.relatedProp = null;

  /**
   * The join table.
   *
   * @type {String}
   */
  this.joinTable = null;

  /**
   * The relation column in the join table that points to the owner table.
   *
   * @type {String}
   */
  this.joinTableOwnerCol = null;

  /**
   * The relation column in the join table that points to the related table.
   *
   * @type {String}
   */
  this.joinTableRelatedCol = null;

  /**
   * Optional additional filter query.
   *
   * @type {function (QueryBuilder)}
   */
  this.filter = null;
}

/**
 * Makes the given constructor a subclass of this class.
 *
 * @param {function=} subclassConstructor
 * @return {function}
 */
Relation.extend = function (subclassConstructor) {
  utils.inherits(subclassConstructor, this);
  return subclassConstructor;
};

Relation.prototype.setMapping = function (mapping) {
  var Model = require('../Model');

  if (!utils.isSubclassOf(this.ownerModelClass, Model)) {
    throw new Error('Relation\'s owner is not a subclass of Model');
  }

  var errorPrefix = this.ownerModelClass.name + '.relationMappings.' + this.name;

  if (!mapping.modelClass) {
    throw new Error(errorPrefix + '.modelClass is not defined');
  }

  if (_.isString(mapping.modelClass)) {
    try {
      this.relatedModelClass = require(mapping.modelClass);
    } catch (err) {
      throw new Error(errorPrefix + '.modelClass is an invalid file path to a model class.');
    }

    if (!utils.isSubclassOf(this.relatedModelClass, Model)) {
      throw new Error(errorPrefix + '.modelClass is a valid path to a module, but the module doesn\'t export a Model subclass.');
    }
  } else {
    this.relatedModelClass = mapping.modelClass;

    if (!utils.isSubclassOf(this.relatedModelClass, Model)) {
      throw new Error(errorPrefix + '.modelClass is not a subclass of Model or a file path to a module that exports one.');
    }
  }

  if (!mapping.relation) {
    throw new Error(errorPrefix + '.relation is not defined');
  }

  if (!utils.isSubclassOf(mapping.relation, Relation)) {
    throw new Error(errorPrefix + '.relation is not a subclass of Relation');
  }

  if (!mapping.join || !_.isString(mapping.join.from) || !_.isString(mapping.join.to)) {
    throw new Error(errorPrefix + '.join must be an object that maps the columns of the related models together. For example: {from: \'SomeTable.id\', to: \'SomeOtherTable.someModelId\'}');
  }

  var joinOwner = null;
  var joinRelated = null;

  var joinFrom = parseColumn(mapping.join.from);
  var joinTo = parseColumn(mapping.join.to);

  if (!joinFrom.table || !joinFrom.name) {
    throw new Error(errorPrefix + '.join.from must have format TableName.columnName. For example `SomeTable.id`.');
  }

  if (!joinTo.table || !joinTo.name) {
    throw new Error(errorPrefix + '.join.to must have format TableName.columnName. For example `SomeTable.id`.');
  }

  if (joinFrom.table === this.ownerModelClass.tableName) {
    joinOwner = joinFrom;
    joinRelated = joinTo;
  } else if (joinTo.table === this.ownerModelClass.tableName) {
    joinOwner = joinTo;
    joinRelated = joinFrom;
  } else {
    throw new Error(errorPrefix + '.join: either `from` or `to` must point to the owner model table.');
  }

  if (joinRelated.table !== this.relatedModelClass.tableName) {
    throw new Error(errorPrefix + '.join: either `from` or `to` must point to the related model table.');
  }

  if (mapping.join.through) {
    if (!_.isString(mapping.join.through.from) || !_.isString(mapping.join.through.to)) {
      throw new Error(errorPrefix + '.join.through must be an object that describes the join table. For example: {from: \'JoinTable.someId\', to: \'JoinTable.someOtherId\'}');
    }

    var joinTableFrom = parseColumn(mapping.join.through.from);
    var joinTableTo = parseColumn(mapping.join.through.to);

    if (!joinTableFrom.table || !joinTableFrom.name) {
      throw new Error(errorPrefix + '.join.through.from must have format JoinTable.columnName. For example `JoinTable.someId`.');
    }

    if (!joinTableTo.table || !joinTableTo.name) {
      throw new Error(errorPrefix + '.join.through.to must have format JoinTable.columnName. For example `JoinTable.someId`.');
    }

    if (joinTableFrom.table !== joinTableTo.table) {
      throw new Error(errorPrefix + '.join.through `from` and `to` must point to the same join table.');
    }

    this.joinTable = joinTableFrom.table;

    if (joinFrom.table === this.ownerModelClass.tableName) {
      this.joinTableOwnerCol = joinTableFrom.name;
      this.joinTableRelatedCol = joinTableTo.name;
    } else {
      this.joinTableRelatedCol = joinTableFrom.name;
      this.joinTableOwnerCol = joinTableTo.name;
    }
  }

  this.ownerProp = this._propertyName(joinOwner, this.ownerModelClass);
  this.ownerCol = joinOwner.name;
  this.relatedProp = this._propertyName(joinRelated, this.relatedModelClass);
  this.relatedCol = joinRelated.name;
  this.filter = parseFilter(mapping);
};

Relation.prototype.fullOwnerCol = function () {
  return this.ownerModelClass.tableName + '.' + this.ownerCol;
};

Relation.prototype.fullRelatedCol = function () {
  return this.relatedModelClass.tableName + '.' + this.relatedCol;
};

Relation.prototype.fullJoinTableOwnerCol = function () {
  return this.joinTable + '.' + this.joinTableOwnerCol;
};

Relation.prototype.fullJoinTableRelatedCol = function () {
  return this.joinTable + '.' + this.joinTableRelatedCol;
};

Relation.prototype.clone = function () {
  var clone = new this.constructor(this.name, this.ownerModelClass);

  clone.relatedModelClass = this.relatedModelClass;
  clone.ownerCol = this.ownerCol;
  clone.ownerProp = this.ownerProp;
  clone.relatedCol = this.relatedCol;
  clone.relatedProp = this.relatedProp;
  clone.joinTable = this.joinTable;
  clone.joinTableOwnerCol = this.joinTableOwnerCol;
  clone.joinTableRelatedCol = this.joinTableRelatedCol;
  clone.filter = this.filter;

  return clone;
};

Relation.prototype.bindKnex = function (knex) {
  var bound = this.clone();

  bound.relatedModelClass = bound.relatedModelClass.bindKnex(knex);
  bound.ownerModelClass = bound.ownerModelClass.bindKnex(knex);

  return bound;
};

Relation.prototype.find = function (builder, $owners) {
  return builder;
};

Relation.prototype.insert = function (builder, $owner, $insertion) {
  return builder;
};

Relation.prototype.update = function (builder, $owner, $update) {
  return builder;
};

Relation.prototype.patch = function (builder, $owner, $patch) {
  return builder;
};

Relation.prototype.delete = function (builder, $owner) {
  return builder;
};

Relation.prototype.relate = function (builder, $owner, ids) {
  return builder;
};

Relation.prototype.unrelate = function (builder, $owner) {
  return builder;
};

Relation.prototype._propertyName = function (column, modelClass) {
  var propertyName = modelClass.columnNameToPropertyName(column.name);

  if (!propertyName) {
    throw new Error(modelClass.name +
    '.$parseDatabaseJson probably transforms the value of the column ' + column.name + '.' +
    ' This is a no-no because ' + column.name +
    ' is needed in the relation ' + this.ownerModelClass.name + '.' + this.name);
  }

  return propertyName;
};

function parseFilter(mapping) {
  if (_.isFunction(mapping.filter)) {
    return mapping.filter;
  } else if (_.isObject(mapping.filter)) {
    return function (queryBuilder) {
      queryBuilder.where(mapping.filter);
    };
  } else {
    return _.noop;
  }
}

function parseColumn(column) {
  var parts = column.split('.');

  return {
    table: parts[0] && parts[0].trim(),
    name: parts[1] && parts[1].trim()
  };
}

module.exports = Relation;
