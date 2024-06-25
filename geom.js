export class Point {
    constructor(x, y) { this.x = x; this.y = y; }

    scale(s) {
        return new Point(this.x * s, this.y * s);
    }

    add(v) {
        return new Point(this.x + v.x, this.y + v.y);
    }

    negate() {
        return new Point(-this.x, -this.y);
    }

    subtract(v) {
        return new Point(this.x - v.x, this.y - v.y);
    }
}

export const ORIGIN = new Point(0, 0);

export class Transform {
    constructor(t1, s, t2) { this.t1 = t1; this.s = s; this.t2 = t2; }

    applyToPoint(p) {
        return p.subtract(this.t1).scale(this.s).add(this.t2);
    }

    invert() {
        return new Transform(this.t2.negate(), 1 / this.s, this.t1.negate());
    }
}

export class Box {
    constructor(t, l, b, r) { this.t = t; this.l = l; this.b = b; this.r = r; }

    static fromTLBR(tl, br) {
        return new Box(tl.y, tl.x, br.y, br.x);
    }

    getCenter() {
        return new Point((this.l + this.r) / 2, (this.t + this.b) / 2);
    }

    tl() { return new Point(this.l, this.t); }

    br() { return new Point(this.r, this.b); }

    getWidth() {
        return this.r - this.l;
    }

    getHeight() {
        return this.b - this.t;
    }

    transform(t) {
        const tl = this.tl();
        const br = this.br();
        return Box.fromTLBR(t.applyToPoint(tl), t.applyToPoint(br));
    }

    scale(s) {
        return this.transform(new Transform(ORIGIN, s, ORIGIN));
    }

    add(v) {
        return this.transform(new Transform(ORIGIN, 1, v));
    }

    scaleAround(center, s) {
        return this.transform(new Transform(center, s, center.negate()));
    }

    scaleAroundCenter(s) {
        return this.scaleAround(this.getCenter(), s);
    }

    computeTransformTo(b2) {
        const scale = Math.min(b2.getWidth() / this.getWidth(), b2.getHeight() / this.getHeight());
        return new Transform(this.getCenter().negate(), scale, b2.getCenter());
    }
}