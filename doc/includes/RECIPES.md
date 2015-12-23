# Recipe book

## Raw queries

```js
Person
  .query()
  .select(Person.raw('coalesce(sum(??), 0) as ??', ['age', 'childAgeSum']))
  .groupBy('parentId')
  .then(function (childAgeSums) {
    console.log(childAgeSums[0].childAgeSum);
  });
```

To write raw SQL queries, use the [`raw`](#raw) method of any [`Model`](#model) subclass. There are also some helper 
methods such as [`whereRaw`](#whereraw) in the [`QueryBuilder`](#querybuilder). The [`raw`](#raw) method works just like the 
[knex's raw method](http://knexjs.org/#Raw).

## Change id column

```js
Person.idColumn = 'person_id';
```

Name of the identifier column can be changed by setting the static [`idColumn`](#idcolumn) property of a model class.

## Custom validation

> Additional validation:

```js
Person.prototype.$beforeInsert = function () {
  if (this.id) {
    throw new objection.ValidationError({id: 'identifier should not be defined before insert'});
  }
};
```

> Replace `jsonSchema` validation:

```js
Person.prototype.$validate = function (objectToValidate, options) {
  // This makes revalidation possible: `someModel.$validate()`.
  objectToValidate = objectToValidate || this;

  if (!someCustomValidator(objectToValidate)) {
    throw new objection.ValidationError({someProp: 'validation error message for the property'});
  }

  // Remember to return the input json object.
  return objectToValidate;
};
```

If you want to use the json schema validation but add some custom validation on top of it you can override the
[`$beforeValidate`](#beforevalidate) and [`$afterValidate`](#aftervalidate) methods.

If you need to do validation on insert or update you can throw exceptions from the 
[`$beforeInsert`](#beforeinsert) and [`$beforeUpdate`](#beforeupdate) methods.

If you don't want to use the built-in json schema validation, you can just ignore the [`jsonSchema`](#jsonschema) property. 
It is completely optional. If you want to use some other validation library, simply override the [`$validate`](#validate)
method of the model class. You need to throw a [`ValidationError`](#validationerror) when validation fails.

## Map column names to different property names

> snake_case/camelCase conversion:

```js
// This is called when an object is serialized to database format.
Person.prototype.$formatDatabaseJson = function (json) {
  // Call superclass implementation.
  json = Model.prototype.$formatDatabaseJson.call(this, json);

  return _.mapKeys(json, function (value, key) {
    return _.snakeCase(key);
  });
};

// This is called when an object is read from database.
Person.prototype.$parseDatabaseJson = function (json) {
  json = _.mapKeys(json, function (value, key) {
    return _.camelCase(key);
  });

  // Call superclass implementation.
  return Model.prototype.$parseDatabaseJson.call(this, json);
};
```

> Note that even though column names are mapped when fetching / storing data, one still has to use
> correct db column names when writing queries:

```js
await Person.query().insert({ firstName: 'Jennifer' });
let jen = await Person.query().where('first_name', 'Jennifer');
expect(jen.firstName).to.equal('Jennifer');
```

Sometimes you may want to use for example snake_cased column names in database tables
and camelCased property names in code. You can use the functions

- [`$parseDatabaseJson`](#parsedatabasejson)
- [`$formatDatabaseJson`](#formatdatabasejson)
- [`$parseJson`](#parsejson)
- [`$formatJson`](#formatjson)

to convert data between database and "external" representations.

## Paging

```js
Person
  .query()
  .where('age', '>', 20)
  .page(5, 100)
  .then(function (result) {
    console.log(result.results.length); // --> 100
    console.log(result.total); // --> 3341
  });
```

Any query can be paged using the [`page`](#page) or [`range`](#range) method.

## Subqueries

> Use function:

```js
Person
  .query()
  .where('age', '>', function (builder) {
    builder.avg('age').from('Person');
  })
  .then(function (peopleOlderThanAverage) {
    console.log(peopleOlderThanAverage);
  });
```

> Use `QueryBuilder`:

```js
Person
  .query()
  .where('age', '>', Person.query().avg('age'))
  .then(function (peopleOlderThanAverage) {
    console.log(peopleOlderThanAverage);
  });
```

Subqueries can be written just like in knex: by passing a function in place of a value. A bunch of query building 
methods accept a function. See the knex.js documentation or just try it out. A function is accepted in most places 
you would expect. You can also pass [`QueryBuilder`](#querybuilder) instances instead of functions.

## Joins

```js
Person
  .query()
  .select('Person.*', 'Parent.firstName as parentName')
  .join('Person as Parent', 'Person.parentId', 'Parent.id')
  .then(function (persons) {
    console.log(persons[0].parentName);
  });
```

Again, [do as you would with a knex query builder](http://knexjs.org/#Builder-join).

## Polymorphic associations

```js
Issue.relationMappings = {
  comments: {
    relation: Model.OneToManyRelation,
    modelClass: Comment,
    filter: {commentableType: 'Issue'},
    join: {
      from: 'Issue.id',
      to: 'Comment.commentableId'
    }
  }
};

PullRequest.relationMappings = {
  comments: {
    relation: Model.OneToManyRelation,
    modelClass: Comment,
    filter: {commentableType: 'PullRequest'},
    join: {
      from: 'PullRequest.id',
      to: 'Comment.commentableId'
    }
  }
};
```

> The `{commentableType: 'Type'}` filter adds a `WHERE "commentableType" = 'Type'` clause to the relation fetch
> query. It doesn't automatically set the type when you insert a new comment. You have to set the `commentableType`
> manually:

```js
someIssue
  .$relatedQuery('comments')
  .insert({text: 'blaa', commentableType: 'Issue'})
  .then(...)
```

Creating polymorphic associations isn't as easy as it could be at the moment, but it can be done using
custom filters for relations. Let's assume we have tables `Comment`, `Issue` and `PullRequest`. Both
`Issue` and `PullRequest` can have a list of comments. `Comment` has a column `commentableId` to hold
the foreign key and `commentableType` to hold the related model type. Check out the first example for
how to create relations for this setup ➔

## Timestamps

```js
Person.prototype.$beforeInsert = function () {
  this.createdAt = new Date().toISOString();
};

Person.prototype.$beforeUpdate = function () {
  this.updatedAt = new Date().toISOString();
};
```

You can implement the `$beforeInsert` and `$beforeUpdate` methods to set the timestamps. If you want to do this for all 
your models, you can simply create common base class that implements these methods.

## Custom query builder

> ES5:

```js
var QueryBuilder = require('objection').QueryBuilder;

function MyQueryBuilder() {
  QueryBuilder.apply(this, arguments);
}

QueryBuilder.extend(MyQueryBuilder);

// Some custom method.
MyQueryBuilder.prototype.upsert = function (model) {
  if (model.id) {
    return this.update(model).where('id', model.id);
  } else {
    return this.insert(model);
  }
};

// Instance of this is created when you call `query()` or `$query()`.
Person.QueryBuilder = MyQueryBuilder;
// Instance of this is created when you call `$relatedQuery()`.
Person.RelatedQueryBuilder = MyQueryBuilder;
```

> ES6:

```js
const QueryBuilder = require('objection').QueryBuilder;

class MyQueryBuilder extends QueryBuilder {
  upsert(model) {
     if (model.id) {
       return this.update(model).where('id', model.id);
     } else {
       return this.insert(model);
     }
  }
}

// Instance of this is created when you call `query()` or `$query()`.
Person.QueryBuilder = MyQueryBuilder;
// Instance of this is created when you call `$relatedQuery()`.
Person.RelatedQueryBuilder = MyQueryBuilder;
```

> Now you can do this:

```js
Person.query().upsert(person).then(function () {
  ...
});
```

You can extend the [`QueryBuilder`](#querybuilder) returned by [`Model.query()`](#query), [`modelInstance.$relatedQuery()`](#relatedquery)
and [`modelInstance.$query()`](#query) methods by setting the model class's static [`QueryBuilder`](#querybuilder) and/or
[`RelatedQueryBuilder`](#relatedquerybuilder) property.

If you want to set the custom query builder for all model classes you can just override the [`QueryBuilder`](#querybuilder)
property of the [`Model`](#model) base class. A cleaner option would be to create your own Model subclass, set its [`QueryBuilder`](#querybuilder)
property and inherit all your models from the custom Model class.

## Multi-tenancy

```js
app.use(function (req, res, next) {
  // Function that parses the tenant id from path, header, query parameter etc.
  // and returns an instance of knex.
  var knex = getDatabaseForRequest(req);

  req.models = {
    Person: Person.bindKnex(knex),
    Movie: Movie.bindKnex(knex),
    Animal: Animal.bindKnex(knex)
  };

  next();
});
```

By default, the examples guide you to setup the database connection by setting the knex object of the [`Model`](#model) base
class. This doesn't fly if you want to select the database based on the request as it sets the connection globally.

If you have a different database for each tenant, a useful pattern is to add a middleware that adds the models to
`req.models` hash and then _always_ use the models through `req.models` instead of requiring them directly. What 
[`bindKnex`](#bindknex) method actually does is that it creates an anonymous subclass of the model class and sets its 
knex connection. That way the database connection doesn't change for the other requests that are currently being executed.
