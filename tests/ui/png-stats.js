#!/usr/bin/env -S gjs -m
// @tag:ui-testing
//
// Print simple pixel statistics of a PNG as JSON: {width, height, mean, stddev,
// min, max} over the luma of a sampled pixel grid. Used by the screenshot smoke
// test to assert "something non-uniform was rendered", and handy for local
// golden-image comparisons (compare two files' stats, or diff them yourself).
//
//   gjs -m tests/ui/png-stats.js /path/shot.png

import GdkPixbuf from 'gi://GdkPixbuf';
import system from 'system';

const [path] = system.programArgs;
if (!path) {
    printerr('usage: png-stats.js <file.png>');
    system.exit(2);
}

const pb = GdkPixbuf.Pixbuf.new_from_file(path);
const width = pb.get_width();
const height = pb.get_height();
const rowstride = pb.get_rowstride();
const channels = pb.get_n_channels();
const pixels = pb.get_pixels(); // Uint8Array

// Sample a grid of up to ~256x256 points to keep it fast on large images.
const stepX = Math.max(1, Math.floor(width / 256));
const stepY = Math.max(1, Math.floor(height / 256));
let n = 0, sum = 0, sumSq = 0, min = 255, max = 0;
for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
        const o = y * rowstride + x * channels;
        const luma = 0.2126 * pixels[o] + 0.7152 * pixels[o + 1] +
            0.0722 * pixels[o + 2];
        n++;
        sum += luma;
        sumSq += luma * luma;
        if (luma < min) min = luma;
        if (luma > max) max = luma;
    }
}
const mean = sum / n;
const stddev = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
print(JSON.stringify({
    width, height,
    mean: Math.round(mean * 100) / 100,
    stddev: Math.round(stddev * 100) / 100,
    min: Math.round(min), max: Math.round(max),
}));
