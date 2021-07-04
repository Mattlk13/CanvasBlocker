<?php

header("Content-Security-Policy: default-src 'none'; img-src 'self'; script-src 'self'; style-src 'self'");

?>
<!DOCTYPE html>
<html>
<head>
	<title>CSP test</title>
	<meta http-equiv="content-type" content="text/html; charset=UTF-8">
	<link href="testIcon.svg" type="image/png" rel="icon">
	<link href="testIcon.svg" type="image/png" rel="shortcut icon">
	<link rel="stylesheet" href="../default.css" type="text/css">
</head>
<body>
<h1>CSP test</h1>
<h2>Expected result</h2>
<ul>
	<li>if the window API protection is active the window name at start is always empty</li>
	<li>the canvas hash changes upon reload (depending on CanvasBlocker settings - e.g. not in the stealth preset)</li>
</ul>
<h2>Tests</h2>
<div id="results"></div>
<script src="testAPI.js"></script>
<script src="canvasAPI.js"></script>
<script src="cspTest.js"></script>
</body>
</html>