/*
* Implement simple sprite animations using only dom elements and spritesheets.
*
* Author: Ronen Ness, 2016.
* License: MIT.
*/

(function() {

// the time in ms of our main interval
var TIMER_INTERVALS_MS = 10;

// create the main interval
setInterval(function() {
    Spritenator.mainLoop(TIMER_INTERVALS_MS);
}, TIMER_INTERVALS_MS);

// create main object
var Spritenator = {

    // spritenator version
    version: "1.0.0",

    // all sprites instances
    sprites: {},

    // main loop function
    // @param timePassed - how many ms passed since last call.
    mainLoop: function(timePassed) {

        // iterate over sprites and animate them
        for (id in this.sprites) {
            this.sprites[id].step(timePassed);
        }
    },

    // define an animation sequence for Spritenators.
    // @param data - data dictionary with:
    //                  steps: list of step indexes (int), counted from top-left corner.
    //                  delays []: optional list of delay, in ms, to wait extra on every step.
    //                  fps [10]: default frames per seconds, eg how long to wait on each frame (before the extra delays if provided)
    //                  loop [true]: should this animation play in endless loops until stopped?
    //                  next []: if defined, once this animation ends will start playing next animation (ignore 'loop' setting)
    //                  startDelay [0]: delay to add to first animation step.
    //                  endDelay [0]: delay to add to last animation step.
    //                  onStart []: optional function to call whenever this animation starts.
    //                  onEnd []: optional function to call whenever this animation ends.
    animation: function(data) {

        // create object to return
        var ret = {};

        // copy steps and some other data
        ret.steps = data.steps;
        ret.loop = data.loop === undefined ? true : data.loop;
        if (data.next) ret.next = data.next;
        if (data.onStart) ret.onStart = data.onStart;
        if (data.onEnd) ret.onEnd = data.onEnd;

        // get delays list
        var delays = data.delays || [];

        // calc base delay for all steps
        var baseDelay = 1000.0 / (data.fps || 10);

        // set delays
        ret.delays = [];
        for (var i = 0; i < ret.steps.length; ++i) {
            ret.delays.push(baseDelay + (delays[i] || 0));
        }

        // set start delay and end delay
        ret.delays[0] += data.startDelay || 0;
        ret.delays[ret.delays.length-1] += data.endDelay || 0;

        // return animation data
        return ret;
    },

    // create sprite instance on an img dom element.
    // @param element - the div dom element to apply animation on (to use SpriteAnimateJs you must have a parent div
    //                  containing img tag inside).
    // @param sheetSize - dictionary with {x, y}, indicating how many animation steps there are on x and y axis.
    // @param animations - dictionary with animation instances.
    //                      key is animation name, value is Spritenator.animation().
    create: function(element, sheetSize, animations) {

        // create the new sprite animator instance
        var sprite = new Sprite(element, sheetSize, animations);

        // add to active sprites dictionary
        this.sprites[sprite.id] = sprite;

        // attach sprite id to element
        element.dataset["sprite_animation_id"] = sprite.id;

        // return the new sprite
        return sprite;
    },

    // get sprite instance from dom element
    get: function(element) {

        var id = element.dataset["sprite_animation_id"];
        return this.sprites[id];
    },
};

// to generate unique sprites ids
var nextSpriteId = 0;

// a single sprite animator instance.
// element is the div element containing the image.
function Sprite(element, sheetSize, animations) {

    // make sure dom structure is correct
    if (element.tagName !== "DIV" ||
        element.children[0].tagName !== "IMG") {
            throw "To create a sprite animator you must provide a <div> element with an <img> as first child! Please read docs for more info and examples.";
        }

    // set unique id
    this.id = nextSpriteId++;

    // set sprite data
    this.div = element;
    this.img = element.children[0];
    this.sheetSize = sheetSize;
    this.animations = animations;
    this.speed = 1;
    this.paused = false;

    // set parent div overflow mode
    this.div.style.overflow = "hidden";

    // get computer div style
    style = window.getComputedStyle(element);

    // if parent div position is not relative / fixed or absolute, set to relative by default.
    if (["relative", "fixed", "absolute"].indexOf(style.getPropertyValue('position')) === -1) {
        this.div.style.position = "relative";
    }

    // set default size
    if (style.getPropertyValue("width") === "auto") this.div.style.width = "128px";
    if (style.getPropertyValue("height") === "auto") this.div.style.height = "128px";

    // set image style properties
    this.img.style.position = "absolute";
    this.img.style.width = (100 * this.sheetSize.x) + "%";
    this.img.style.height = (100 * this.sheetSize.y) + "%";
    this.img.style.left = "0px";
    this.img.style.top = "0px";

    // set default animation name
    this.defaultAnimation = null;
    for (var key in animations) {
        this.defaultAnimation = key;
        break;
    }

    // play default animation
    if (this.defaultAnimation) {
        this.play(this.defaultAnimation);
    }

};

// sprite prototype
Sprite.prototype = {

    // start playing animation by name
    // @param name - animation name to play.
    // @param forceReset - if true, and already playing chosen animation, will still reset it.
    //                      if false (default) and already playing it, nothing will happen.
    // @param next - if specified, will override the default animation 'next' and go to this animation when done.
    play: function(name, forceReset, next) {

        // get if need to reset animation
        var needReset = forceReset || ((this._curr || {}).name !== name);

        // set current animation ane make sure exists
        this._curr = this.animations[name];
        if (!this._curr) {
            throw "Animation '" + name + "' is undefined!";
        }

        // set forced next, if provided
        this._forceNext = next;

        // reset animation if needed
        if (needReset) {
            this.reset();
        }

        // to make it chainable
        return this;
    },

    // reset currently playing animation
    reset: function(keepCurrStepTime) {

        // reset current step
        this._stepIndex = 0;
        if (!keepCurrStepTime) {
			this._timeInStep = 0.0;
		}
        this._reachedEnd = false;
        this._lastStepIndex = -1;

        // call start callback
        if (this._curr.onStart) this._curr.onStart();

        // update sprite view
        this._updateSpritePos();

        // to make it chainable
        return this;
    },

    // play a single animation step.
    // @param timePassed - how much time, in ms, passed since last play time.
    step: function(timePassed) {

        // if paused or reached end, skip
        if (this.paused || this._reachedEnd) {
            return;
        }

        // increase time in current step
        this._timeInStep += timePassed * this.speed;

        // get delay for current step
        var currDelay = this._curr.delays[this._stepIndex];

        // if need to move to next step
        if (this._timeInStep >= currDelay) {

            // increase current step index
            this._stepIndex += 1;
            this._timeInStep -= currDelay;

            // check if animation ended
            if (this._stepIndex >= this._curr.steps.length) {

                // call end callback
                if (this._curr.onEnd) this._curr.onEnd();

                // if we got "next" animation, play it
                var next = this._forceNext || this._curr.next;
                if (next) {
                    next = (typeof next === "function") ? next(this) : next;
                    this.play(next);
                    return;
                }

                // if its not in loop, stop here!
                if (!this._curr.loop) {
                    this._reachedEnd = true;
                    return;
                }

                // if got here it means we need to reset animation
                this.reset(true);
            }
        }
        this._updateSpritePos();

        // to make it chainable
        return this;
    },

    // return current animation name
    current: function() {
        return this._curr.name;
    },

    // destroy this sprite animator
    destroy: function() {
        delete Spritenator.sprites[this.id];
    },

    // update sprite position in spritesheet, but only if needed
    _updateSpritePos: function() {

        // check if need to update img position
        if (this._lastStepIndex !== this._stepIndex) {

            // get step in spritesheet
            var stepInSheet = this._curr.steps[this._stepIndex];

            // calc position in spritesheet
            var posX = stepInSheet % this.sheetSize.x;
            var posY = Math.floor(stepInSheet / this.sheetSize.x);

            // set image position based on index
            this.img.style.left = (-100 * posX) + "%";
            this.img.style.top = (-100 * posY) + "%";

            // store curr step index
            this._lastStepIndex = this._stepIndex;
        }
    },

}

// export to window object
window.Spritenator = Spritenator;

})();