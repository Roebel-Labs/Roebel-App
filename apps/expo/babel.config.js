module.exports = function (api) {
	api.cache(true);
	return {
		presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
		plugins: [
			"@babel/plugin-transform-export-namespace-from",
			[
				"module-resolver",
				{
					root: ["./"],
					alias: {
						"@/components": "./components",
						"@/lib": "./lib",
						"@/context": "./context",
						"@/assets": "./assets",
						"@/hooks": "./hooks",
						"@/constants": "./constants",
						"@": "./"
					},
					extensions: [".js", ".jsx", ".ts", ".tsx", ".json", ".svg"]
				}
			],
			"react-native-reanimated/plugin",
		],
	};
};
